# Session 02 — Implementation & Load Harness Engineering

**Date:** 2026-09-01  
**Tool:** Gemini 3.6 Flash / Antigravity AI Agent  
**Goal:** Implement policy engine, atomic state store, rate limiter middleware, multi-node cluster runner, and load harness test suite.

---

## User Prompt

> Build the complete vertical slice in Node.js ES modules:
> 1. `policy.js`: Policy engine for Starter (60 RPM), Growth (300 RPM), and Northwind Enterprise (300 RPM base / 1200 RPM batch window 02:00-04:00 UTC).
> 2. `store.js`: Atomic distributed sliding window counter store with HTTP/TCP coordinator.
> 3. `limiter.js`: Middleware returning 429 + Retry-After headers when limit breached.
> 4. `server.js` & `load-balancer.js`: 3 app nodes + round-robin load balancer proxy.
> 5. `harness.js`: First-class load verification harness testing multi-node consistency, exact boundary limits, Northwind batch window, and customer isolation.

---

## Agent Tool Calls & Implementation Summary

1. **Created `src/policy.js`**: Defined `CUSTOMER_POLICIES` and `getCustomerPolicy(customerId, atTime)` returning time-windowed effective RPMs.
2. **Created `src/store.js`**: Implemented `DistributedStore` using sub-second sliding window buckets with `_evalSlidingWindow` and atomic `/check-and-increment` endpoint.
3. **Created `src/limiter.js`**: Implemented `createRateLimiterMiddleware` extracting `X-Customer-Id` and `X-Simulated-Time`, injecting `X-RateLimit-*` and `X-Node-Id` headers, and setting `Retry-After` on 429 errors.
4. **Created `src/server.js` & `src/load-balancer.js`**: Built 3 stateless app node servers and a round-robin HTTP proxy on port 3000.
5. **Created `src/cluster-runner.js`**: Built cluster orchestrator spawning coordinator + 3 app nodes + load balancer.
6. **Created `src/harness.js`**: Implemented 6 verification suites with terminal formatting and keep-alive batch HTTP agent.

---

## Iterative Debugging Log

- **Initial Issue**: High concurrency bursts (>1000 requests) caused ephemeral socket exhaustion on Windows OS (`500 Connection Reset`).
- **Diagnosis**: Node `http.request` without persistent socket reuse opened 1000 simultaneous sockets in <1ms.
- **Fix Applied**: Added `http.Agent({ keepAlive: true, maxSockets: 100 })` and batch chunking in `harness.js`. Re-running `node src/harness.js` produced 100% clean execution with zero 500 errors across all 6 suites!
