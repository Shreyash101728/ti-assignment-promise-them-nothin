/**
 * Stateless Round-Robin Load Balancer Proxy
 * 
 * Simulates RelayAPI's production ingress infrastructure, routing requests randomly/round-robin
 * across 3 stateless app nodes (ports 3001, 3002, 3003).
 */

import http from 'http';

const LB_PORT = parseInt(process.env.LB_PORT || '3000', 10);
const TARGET_NODES = [
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003'
];

let roundRobinIndex = 0;

export function startLoadBalancer() {
  const server = http.createServer((clientReq, clientRes) => {
    // Round-robin node selection
    const targetUrlString = TARGET_NODES[roundRobinIndex % TARGET_NODES.length];
    roundRobinIndex++;

    const targetUrl = new URL(clientReq.url, targetUrlString);

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: clientReq.method,
      headers: {
        ...clientReq.headers,
        host: targetUrl.host
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(clientRes, { end: true });
    });

    proxyReq.on('error', (err) => {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
    });

    clientReq.pipe(proxyReq, { end: true });
  });

  return new Promise((resolve) => {
    server.listen(LB_PORT, () => {
      console.log(`[Load Balancer] Listening on port ${LB_PORT} -> forwarding to [3001, 3002, 3003]`);
      resolve(server);
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith('load-balancer.js')) {
  startLoadBalancer();
}
