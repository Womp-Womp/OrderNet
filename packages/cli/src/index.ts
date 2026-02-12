#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { OrderNetNode } from '@ordernet/core';
import { App } from './app.js';

async function main() {
  const args = process.argv.slice(2);
  const nickIdx = args.indexOf('--nick');
  const portIdx = args.indexOf('--port');
  const dbIdx = args.indexOf('--db');
  const bootstrapPeers = collectRepeatedArg(args, '--bootstrap');
  const enableMdns = args.includes('--mdns');

  const nickname = nickIdx >= 0 ? args[nickIdx + 1] : undefined;
  const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : undefined;
  const dbPath = dbIdx >= 0 ? args[dbIdx + 1] : undefined;

  const node = new OrderNetNode({
    nickname,
    listenPort: port,
    dbPath,
    bootstrapPeers,
    enableMdns,
  });

  console.log('Starting OrderNet...');
  await node.start();

  const info = node.getIdentity();
  console.log(`Identity: ${info.nickname} (${info.fingerprint})`);
  console.log(`Peer ID: ${node.getPeerId()}`);
  console.log(`Addresses: ${node.getAddresses().join(', ')}`);
  console.log('');

  // Auto-join #general
  node.createChannel('general');

  const { waitUntilExit } = render(
    React.createElement(App, { node }),
    { exitOnCtrlC: true }
  );

  await waitUntilExit();
  await node.stop();
  process.exit(0);
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
