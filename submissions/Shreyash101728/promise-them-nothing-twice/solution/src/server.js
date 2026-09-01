/**
 * Stateless RelayAPI App Node Server
 * 
 * Demonstrates a production-style API node behind a load balancer proxy.
 * Uses distributed state store for uniform rate-limiting across multi-node deployments.
 */

import http from 'http';
import { DistributedStore } from './store.js';
import { createRateLimiterMiddleware } from './limiter.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const NODE_ID = process.env.NODE_ID || `node-${PORT}`;
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://127.0.0.1:4000';

const store = new DistributedStore({ coordinatorUrl: COORDINATOR_URL });
const rateLimiter = createRateLimiterMiddleware(store);

const server = http.createServer((req, res) => {
  // Apply rate limiter middleware to API endpoints
  rateLimiter(req, res, () => {
    if (req.url.startsWith('/api/v1/ping')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Node-Id': NODE_ID });
      res.end(JSON.stringify({ status: 'ok', node: NODE_ID, timestamp: Date.now() }));
    } else if (req.url.startsWith('/api/v1/data')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Node-Id': NODE_ID });
      res.end(JSON.stringify({ message: 'Success', node: NODE_ID, data: [1, 2, 3] }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[${NODE_ID}] App Node listening on port ${PORT} (Coordinator: ${COORDINATOR_URL})`);
});
