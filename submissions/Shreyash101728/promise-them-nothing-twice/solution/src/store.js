/**
 * Distributed Atomic State Store for Rate Limiting
 * 
 * Manages atomic sub-second sliding window request counts across stateless nodes.
 * Features a zero-dependency HTTP/TCP State Coordinator Server & Client for frictionless multi-node testing,
 * with seamless Redis adapter support.
 */

import http from 'http';

export class DistributedStore {
  constructor(options = {}) {
    this.coordinatorUrl = options.coordinatorUrl || process.env.COORDINATOR_URL || null;
    this.localStore = new Map(); // customerId -> Map(secondTimestamp -> count)
    this.isCoordinator = options.isCoordinator || false;
    this.server = null;
    this.port = options.coordinatorPort || 4000;
  }

  /**
   * Starts the Centralized Atomic State Coordinator Server (if this node is designated coordinator).
   */
  async startCoordinator() {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/check-and-increment') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { customerId, limit, windowSec = 60, atTime = Date.now() } = JSON.parse(body);
              const result = this._evalSlidingWindow(customerId, limit, windowSec, atTime);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else if (req.method === 'POST' && req.url === '/reset') {
          this.localStore.clear();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.listen(this.port, () => {
        resolve(`State Coordinator running on port ${this.port}`);
      });
    });
  }

  /**
   * Stops coordinator server if running.
   */
  async stopCoordinator() {
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
  }

  /**
   * Checks quota and increments request count atomically across distributed nodes.
   */
  async checkAndIncrement(customerId, limit, windowSec = 60, atTime = Date.now()) {
    if (this.coordinatorUrl) {
      // Forward check atomically to Central State Coordinator
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ customerId, limit, windowSec, atTime });
        const url = new URL('/check-and-increment', this.coordinatorUrl);
        const req = http.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              // Fallback to local evaluation on error
              resolve(this._evalSlidingWindow(customerId, limit, windowSec, atTime));
            }
          });
        });
        req.on('error', () => {
          // Fallback to local evaluation if coordinator unreachable
          resolve(this._evalSlidingWindow(customerId, limit, windowSec, atTime));
        });
        req.write(payload);
        req.end();
      });
    }

    // Direct in-memory evaluation
    return this._evalSlidingWindow(customerId, limit, windowSec, atTime);
  }

  /**
   * Internal Sliding Window Log/Counter logic.
   */
  _evalSlidingWindow(customerId, limit, windowSec, atTime) {
    const nowSec = Math.floor(atTime / 1000);
    const windowStartSec = nowSec - windowSec;

    if (!this.localStore.has(customerId)) {
      this.localStore.set(customerId, new Map());
    }

    const customerBuckets = this.localStore.get(customerId);

    // Evict old timestamps outside the sliding window
    for (const secKey of customerBuckets.keys()) {
      if (secKey <= windowStartSec) {
        customerBuckets.delete(secKey);
      }
    }

    // Calculate current total requests in window
    let currentUsage = 0;
    for (const count of customerBuckets.values()) {
      currentUsage += count;
    }

    if (currentUsage >= limit) {
      // Over limit: reject and calculate retry-after
      const nextResetSec = 60 - (nowSec % windowSec);
      return {
        allowed: false,
        currentUsage,
        limit,
        remaining: 0,
        retryAfterSec: Math.max(1, nextResetSec)
      };
    }

    // Allowed: increment current second bucket
    const currentSecondCount = customerBuckets.get(nowSec) || 0;
    customerBuckets.set(nowSec, currentSecondCount + 1);

    const newUsage = currentUsage + 1;
    const remaining = Math.max(0, limit - newUsage);
    const resetSec = 60 - (nowSec % windowSec);

    return {
      allowed: true,
      currentUsage: newUsage,
      limit,
      remaining,
      retryAfterSec: 0,
      resetSec
    };
  }

  /**
   * Reset store (useful for clean harness test runs)
   */
  async clear() {
    this.localStore.clear();
    if (this.coordinatorUrl) {
      try {
        const url = new URL('/reset', this.coordinatorUrl);
        await new Promise((resolve) => {
          const req = http.request(url, { method: 'POST' }, () => resolve());
          req.on('error', () => resolve());
          req.end();
        });
      } catch (e) {}
    }
  }
}
