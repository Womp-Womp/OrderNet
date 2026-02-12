import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { OrderNetNode } from '@ordernet/core';
import { WebSocketBridge } from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nick');
  const portIdx = args.indexOf('--port');
  const httpPortIdx = args.indexOf('--http-port');
  const dbIdx = args.indexOf('--db');
  const bootstrapPeers = collectRepeatedArg(args, '--bootstrap');
  const enableMdns = args.includes('--mdns');

  const nickname = nickIdx >= 0 ? args[nickIdx + 1] : undefined;
  const p2pPort = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : undefined;
  const httpPort = httpPortIdx >= 0 ? parseInt(args[httpPortIdx + 1], 10) : 3000;
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;

  // Start OrderNet node
  const node = new OrderNetNode({
    nickname,
    listenPort: p2pPort,
    dbPath,
    bootstrapPeers,
    enableMdns,
  });

  console.log('Starting OrderNet node...');
  await node.start();

  const info = node.getIdentity();
  console.log(`Identity: ${info.nickname} (${info.fingerprint})`);

  // Auto-join #general
  node.createChannel('general');

  // Create WebSocket bridge
  const bridge = new WebSocketBridge(node);

  // Start Fastify server
  const app = Fastify({ logger: false });

  await app.register(websocket);

  // Serve static files from client directory
  const clientDir = path.join(__dirname, '..', 'src', 'client');
  await app.register(fastifyStatic, {
    root: clientDir,
    prefix: '/',
  });

  // WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket, _req) => {
    bridge.addClient(socket);
  });

  await app.listen({ port: httpPort, host: '0.0.0.0' });
  console.log(`Web UI available at http://localhost:${httpPort}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await app.close();
    await node.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

function collectRepeatedArg(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      values.push(args[i + 1]);
      i++;
    }
  }
  return values;
}
