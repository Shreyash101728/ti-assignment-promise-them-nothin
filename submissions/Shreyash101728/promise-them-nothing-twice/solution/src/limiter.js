/**
 * RelayAPI Rate Limiter Middleware
 * 
 * Enforces per-customer RPM limits, injects auditable HTTP headers,
 * and handles hard enforcement (429 + Retry-After) across distributed node clusters.
 */

import { getCustomerPolicy } from './policy.js';

export function createRateLimiterMiddleware(store) {
  return async function rateLimiterMiddleware(req, res, next) {
    const customerId = req.headers['x-customer-id'] || 'anonymous';
    
    // Support test harness timestamp simulation (e.g., simulating 02:30 UTC batch window)
    const simulatedTimeHeader = req.headers['x-simulated-time'];
    const requestTimestamp = simulatedTimeHeader ? Number(simulatedTimeHeader) : Date.now();

    // 1. Resolve auditable customer policy & effective RPM limit
    const policy = getCustomerPolicy(customerId, requestTimestamp);

    // 2. Check and increment count atomically across distributed cluster
    const result = await store.checkAndIncrement(
      customerId,
      policy.effectiveRPM,
      60, // 60-second window
      requestTimestamp
    );

    // 3. Set standard rate limit headers & Node identity
    const nodeId = process.env.NODE_ID || 'node-3001';
    res.setHeader('X-Node-Id', nodeId);
    res.setHeader('X-RateLimit-Limit', policy.effectiveRPM);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetSec || 60);
    res.setHeader('X-RateLimit-Tier', policy.tier);
    if (policy.activeSchedule) {
      res.setHeader('X-RateLimit-Active-Schedule', policy.activeSchedule);
    }

    // 4. Handle boundary enforcement
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfterSec);
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        error: 'Too Many Requests',
        message: `RPM limit of ${policy.effectiveRPM} exceeded for customer ${customerId}.`,
        customerId,
        limit: policy.effectiveRPM,
        currentUsage: result.currentUsage,
        retryAfterSeconds: result.retryAfterSec,
        tier: policy.tier
      }));
    }

    next();
  };
}
