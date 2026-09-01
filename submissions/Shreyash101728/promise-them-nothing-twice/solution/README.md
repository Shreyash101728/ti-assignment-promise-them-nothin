# RelayAPI Distributed Rate Limiter Solution

A high-performance, stateless, distributed per-customer rate-limiting service and load-verification harness for RelayAPI.

---

## Quick Start (Target execution: ≤ 2 minutes)

### Prerequisites
- Node.js v18+ (v24 tested)
- No external databases or third-party binary dependencies required!

### Running the Load Verification Harness

Run the comprehensive multi-node load harness with a single command:

```bash
cd submissions/Shreyash101728/promise-them-nothing-twice/solution
node src/harness.js
```

This command automatically:
1. Starts the **Centralized Atomic State Coordinator Server** on port 4000.
2. Spawns **3 Stateless App Nodes** on ports 3001, 3002, and 3003.
3. Starts a **Stateless Round-Robin Load Balancer Proxy** on port 3000.
4. Executes **6 automated verification suites** hammering traffic randomly across all 3 nodes.
5. Prints legible summary tables verifying boundary enforcement, multi-node load distribution, retry-after compliance, Northwind scheduled batch window allowances, and per-tenant isolation.

---

## Architecture Overview

```
                          [ Client / Load Harness ]
                                      │
                                      ▼
                      [ Round-Robin Load Balancer ] (Port 3000)
                         /            |            \
                        /             |             \
                       ▼              ▼              ▼
                 [ App Node 1 ] [ App Node 2 ] [ App Node 3 ]
                 (Port 3001)    (Port 3002)    (Port 3003)
                        \             |             /
                         \            |            /
                          ▼           ▼           ▼
                   [ Central Atomic State Coordinator ] (Port 4000)
                              (Redis / TCP API)
```

### Key Modules

- **`src/policy.js`**: Auditable, schedule-aware policy engine. Resolves effective customer RPM based on contract tiers and scheduled time windows without hardcoded code hacks.
- **`src/store.js`**: Distributed atomic state coordinator managing sub-second sliding window counter buckets across stateless nodes.
- **`src/limiter.js`**: HTTP middleware injecting standard rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) and enforcing hard `429 Too Many Requests` responses.
- **`src/server.js`**: Lightweight stateless app node server instance.
- **`src/load-balancer.js`**: Reverse proxy simulating RelayAPI infrastructure, distributing load across active app nodes.
- **`src/harness.js`**: First-class load generator proving correctness under burst concurrency.

---

## Running Manually

If you prefer to start components individually:

1. **Start the Multi-Node Cluster**:
   ```bash
   node src/cluster-runner.js
   ```

2. **Send Test Requests**:
   ```bash
   # Starter Tier request
   curl -i -H "X-Customer-Id: starter_demo" http://localhost:3000/api/v1/ping

   # Northwind Batch Window simulated request (02:30 UTC)
   curl -i -H "X-Customer-Id: northwind" -H "X-Simulated-Time: 1773455400000" http://localhost:3000/api/v1/ping
   ```

---

## Algorithm Choice & Fairness

- **Algorithm**: **Sliding Window Counter / Log**.
- **Window Size**: 60 seconds (1 minute) with sub-second bucket aggregation.
- **Fairness**: Strictly isolated per `X-Customer-Id`. Sub-second sliding buckets prevent boundary reset spikes (which plague fixed-window limiters).
- **Consistency**: Centralized atomic counter prevents multi-node synchronization drift. Over-limit requests are rejected deterministically with exact `Retry-After` reset seconds calculated.
