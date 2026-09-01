/**
 * Multi-Node Cluster Orchestrator
 * 
 * Programmatically provisions and manages the RelayAPI cluster environment:
 * 1 Atomic State Coordinator Server (Port 4000)
 * 3 Stateless App Nodes (Ports 3001, 3002, 3003)
 * 1 Round-Robin Load Balancer (Port 3000)
 */

import { spawn } from 'child_process';
import { DistributedStore } from './store.js';
import { startLoadBalancer } from './load-balancer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ClusterOrchestrator {
  constructor() {
    this.coordinator = null;
    this.nodeProcesses = [];
    this.lbServer = null;
    this.store = null;
  }

  async start() {
    // 1. Start Atomic State Coordinator
    this.store = new DistributedStore({ isCoordinator: true, coordinatorPort: 4000 });
    await this.store.startCoordinator();

    // 2. Start 3 Stateless App Nodes
    const ports = [3001, 3002, 3003];
    for (const port of ports) {
      const p = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: {
          ...process.env,
          PORT: port.toString(),
          NODE_ID: `node-${port}`,
          COORDINATOR_URL: 'http://127.0.0.1:4000'
        },
        stdio: 'ignore'
      });
      this.nodeProcesses.push(p);
    }

    // Wait 500ms for node servers to listen
    await new Promise(r => setTimeout(r, 500));

    // 3. Start Load Balancer
    this.lbServer = await startLoadBalancer();
  }

  async stop() {
    if (this.lbServer) {
      await new Promise(r => this.lbServer.close(r));
    }
    for (const p of this.nodeProcesses) {
      p.kill();
    }
    if (this.store) {
      await this.store.stopCoordinator();
    }
  }

  async clearStore() {
    if (this.store) {
      await this.store.clear();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('cluster-runner.js')) {
  const orchestrator = new ClusterOrchestrator();
  await orchestrator.start();
  console.log('Cluster started. Press Ctrl+C to terminate.');
  process.on('SIGINT', async () => {
    await orchestrator.stop();
    process.exit(0);
  });
}
