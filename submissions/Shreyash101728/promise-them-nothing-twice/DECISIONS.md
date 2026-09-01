# Decisions — Promise Them Nothing Twice

## Conflict resolution

**What I Decided:**
I resolved the conflict between CTO Priya (demanding strictly fair, hard quota enforcement with zero code hacks) and Support Lead Marcus (demanding Northwind never hit 429s during nightly batch windows) by implementing an **Auditable, Schedule-Aware Policy Engine (`policy.js`)**. 

Northwind's enterprise contract tier explicitly incorporates a time-windowed allowance (300 RPM base; 1200 RPM during 02:00–04:00 UTC). The rate limiter middleware (`limiter.js`) remains 100% generic, strictly uniform, and isolated. It evaluates quota dynamically via policy lookup: `getQuota(customerId, timestamp)`.

**What I Rejected:**
1. **Hardcoded Code Hacks (`if (customerId === 'northwind') return 200;`)**: Rejected because it violates CTO requirements, creates compliance risk, and destroys auditability.
2. **Soft Warnings / Over-billing Path**: Rejected for GA because billing and legal signed off on strict hard quota enforcement (`429 Too Many Requests` + `Retry-After`).
3. **Ad-hoc Single-Node In-Memory Counters**: Rejected because RelayAPI routes traffic across 3 stateless nodes behind a round-robin load balancer.

---

## Technical design

**Algorithm Selection:**
- **Algorithm**: **Sliding Window Counter / Log** aggregated at sub-second bucket granularity.
- **Why over Fixed Window**: Fixed window limiters suffer from boundary burst attacks (e.g., sending 300 requests at 01:59 and 300 at 02:00, effectively doubling throughput). Sliding window provides smooth, accurate rate limiting across rolling 60-second intervals.
- **Why over Leaky Bucket**: Leaky bucket introduces queuing latency. For RelayAPI's enterprise HTTP endpoints, immediate pass-or-reject with precise `Retry-After` headers is preferred over buffering delayed requests.

**Distributed Coordination across Nodes:**
- Nodes share state via an **Atomic Centralized State Coordinator** (`store.js`), backed by Redis or an lightweight atomic HTTP state coordinator server for zero-dependency local testing.
- When requests land on any of the 3 stateless app nodes, sliding window counts are checked and incremented atomically.
- Under high concurrency, state update failures or network latency err on the side of **under-limiting** (rejecting over-limit bursts) to protect upstream infrastructure as directed by CTO requirements.

---

## Verification

**What the Load Harness Proves:**
1. **Multi-Node Consistency**: Distributes traffic across 3 app nodes behind a round-robin load balancer; verifies uniform quota tracking regardless of which node handles the request.
2. **Exact Boundary Enforcement**: Proves 60 RPM (Starter) allows exactly 60 requests and rejects the 61st+ with HTTP 429 and `Retry-After` headers.
3. **Northwind Schedule Compliance**: Proves Northwind receives 1000+ request throughput with **zero 429s** during 02:30 UTC batch window, but is strictly capped at 300 RPM at 14:00 UTC off-peak hours.
4. **Tenant Isolation**: Proves saturating Customer A (Starter) never impacts Customer B (Growth).

**What the Harness Does Not Prove:**
- Multi-region cross-datacenter WAN replication latencies (>50ms network partitions).
- Hardware failure mode recovery during physical coordinator crash / Redis failover.

---

## If I had four more hours

- **Redis Sentinel / Cluster Integration**: Add automatic failover and Redis Lua scripting (`EVALSHA`) for sub-millisecond atomic sliding log ops.
- **Circuit Breaker & Fallback**: Implement local sliding window fallback counters if the central state store becomes unreachable during a network partition.
- **Dynamic Policy Hot-Reloading**: Load customer tier policies from Postgres / Redis pub-sub so commercial contract changes take effect immediately without restarting app nodes.
