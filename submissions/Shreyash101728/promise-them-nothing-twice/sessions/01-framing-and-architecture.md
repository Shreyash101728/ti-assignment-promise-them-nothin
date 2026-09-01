# Session 01 — Technical Framing & Architecture Resolution

**Date:** 2026-09-01  
**Tool:** Gemini 3.6 Flash / Antigravity AI Agent  
**Goal:** Analyze conflicting stakeholder memos, establish architectural requirements, and design policy engine and rate-limiting algorithm for RelayAPI.

---

## User Prompt

> Analyze the assignment briefs for RelayAPI's rate limiter:
> 1. CTO Memo (Priya Nair): Hard enforcement (429 + Retry-After), strictly fair per-customer metering, multi-node consistency across 3 stateless nodes, no hardcoded hacks like `if (customerId === 'northwind')`.
> 2. Support Lead Memo (Marcus Webb): Northwind Logistics (60% ARR) runs a nightly batch 02:00–04:00 UTC (800–1200 RPM vs 300 RPM paper quota). Northwind must never see a 429 during their batch window.
> 3. Resolve this conflict explicitly without resorting to hardcoded code hacks, select an algorithm, and design the distributed architecture.

---

## Agent Analysis & Response

### 1. Conflict Resolution Analysis
- **Core Dilemma**: Marcus demands zero 429s for Northwind during batch windows, while Priya demands strictly uniform, auditable enforcement with zero special-case code branches in production code.
- **Architectural Solution**: **Declarative Schedule-Aware Policy Engine (`policy.js`)**.
  - Contractual customer quotas are not static integers hardcoded in code; they are dynamic, schedule-aware policy definitions.
  - Northwind's Enterprise tier contract explicitly specifies a scheduled time-window allowance: Base 300 RPM, with a 1200 RPM quota between 02:00–04:00 UTC for ERP batch sync.
  - Rate limiter middleware (`limiter.js`) remains 100% generic, strictly uniform, and isolated. It evaluates quota dynamically at time `t` via policy lookup `getQuota(customerId, timestamp)`.
  - **CTO Satisfaction**: Pure generic enforcement, auditable config, uniform logic across all customers. Hard cutoff still enforced if Northwind exceeds 1200 RPM or spikes outside the window.
  - **Support Lead Satisfaction**: Northwind's nightly batch runs cleanly up to 1200 RPM without hitting 429s.

### 2. Algorithm Selection: Sliding Window Log / Counter
- **Evaluated Algorithms**:
  - *Fixed Window*: High risk of burst spikes at window boundaries (e.g. 2x quota at 01:59 and 02:00). Rejected.
  - *Leaky Bucket*: Introduces artificial request queueing latency. Rejected for API endpoints where explicit pass/429 feedback is required.
  - *Token Bucket*: Good burst handling, but requires atomic synchronization of token fill state across nodes.
  - *Sliding Window Log/Counter*: **Selected**. Measures rolling 60-second usage with sub-second bucket aggregation. Guarantees smooth boundary enforcement and exact `Retry-After` calculation.

### 3. Distributed Architecture
- 3 Stateless App Nodes behind a Round-Robin Load Balancer.
- Centralized Atomic State Coordinator (`store.js`) maintaining atomic sub-second bucket counters to ensure all nodes share a single source of truth without drift.
