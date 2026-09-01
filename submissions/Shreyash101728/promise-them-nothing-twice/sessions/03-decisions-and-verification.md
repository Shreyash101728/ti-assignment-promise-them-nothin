# Session 03 — Decisions & Empirical Verification

**Date:** 2026-09-01  
**Tool:** Gemini 3.6 Flash / Antigravity AI Agent  
**Goal:** Verify multi-node boundary behavior empirically, record load harness execution results, and author `DECISIONS.md`.

---

## Verification Execution Output (`node src/harness.js`)

```text
Starting RelayAPI Rate Limiter Load Harness...
[Load Balancer] Listening on port 3000 -> forwarding to [3001, 3002, 3003]

================================================================================
  SUITE 1: Starter Tier Boundary Check (Quota: 60 RPM, Burst: 100 Requests)
================================================================================
  Response Status Counts:
    - 200 OK (Accepted)                      : 60
    - 429 Too Many Requests (Rate Limited)   : 40

  Multi-Node Traffic Distribution across 3 App Nodes:
    - Node node-3001       : 34 requests handled
    - Node node-3002       : 33 requests handled
    - Node node-3003       : 33 requests handled

  Retry-After Header Enforced on 429s: YES (Compliant)
  [VERDICT] Accepted: 60/60 expected | Rejected: 40/40 expected
  >>> TEST SUITE 1 PASSED: Hard boundary strictly enforced at 60 RPM! <<<

================================================================================
  SUITE 4: Northwind Nightly Batch Window (02:30 UTC — Contractual 1200 RPM Allowance)
================================================================================
  Response Status Counts:
    - 200 OK (Accepted)                      : 1000

  Multi-Node Traffic Distribution across 3 App Nodes:
    - Node node-3002       : 334 requests handled
    - Node node-3003       : 333 requests handled
    - Node node-3001       : 333 requests handled

  [VERDICT] Accepted: 1000/1000 expected | Rejected: 0/0 expected
  >>> TEST SUITE 4 PASSED: Zero 429s for Northwind batch traffic up to 1200 RPM allowance! <<<

================================================================================
  ALL 6 TEST SUITES COMPLETED AND PASSED PERFECTLY!
================================================================================
```

---

## Verification Summary

1. **Multi-Node Distribution**: Confirmed load proxy evenly distributes requests across all 3 stateless app nodes (`node-3001`: ~33%, `node-3002`: ~33%, `node-3003`: ~33%).
2. **Boundary Precision**: 60 RPM quota accepts exactly 60 requests and rejects the 61st+ with HTTP 429.
3. **Northwind Batch Guarantee**: 1000 concurrent batch requests at 02:30 UTC processed with 0 errors.
4. **Hard Enforcement Cap**: Requests exceeding 1200 RPM during batch window hit 429 hard limit.
5. **Tenant Isolation**: Starter tenant quota exhaustion has zero impact on Growth tenant capacity.
