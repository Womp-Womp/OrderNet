import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../storage/db.js';
import { MessageStore } from '../storage/messages.js';
import { PeerStore } from '../storage/peers.js';
import { ChannelStore } from '../storage/channels.js';
import { generateIdentity } from '../crypto/identity.js';
import { generateGroupKey } from '../crypto/group-keys.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('PeerStore', () => {
  it('should insert and retrieve peers', async () => {
    const store = new PeerStore(db);
    const id = await generateIdentity('alice');

    store.upsert({
      publicKey: id.publicKey,
      nickname: 'alice',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      addresses: ['/ip4/127.0.0.1/tcp/4001'],
    });

    const peer = store.get(id.publicKey);
    expect(peer).not.toBeNull();
    expect(peer!.nickname).toBe('alice');
    expect(peer!.addresses).toEqual(['/ip4/127.0.0.1/tcp/4001']);
  });

  it('should list all peers', async () => {
    const store = new PeerStore(db);
    const id1 = await generateIdentity('alice');
    const id2 = await generateIdentity('bob');

    store.upsert({
      publicKey: id1.publicKey,
      nickname: 'alice',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      addresses: [],
    });
    store.upsert({
      publicKey: id2.publicKey,
      nickname: 'bob',
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      addresses: [],
    });

    const all = store.getAll();
    expect(all).toHaveLength(2);
  });
});

describe('ChannelStore', () => {
  it('should save and retrieve channels', async () => {
    const store = new ChannelStore(db);
    const id = await generateIdentity('alice');
    const groupKey = generateGroupKey();

    store.save({
      config: {
        id: 'general',
        name: '#general',
        creatorPubKey: id.publicKey,
        vouchThreshold: 2,
        createdAt: Date.now(),
      },
      groupKey,
      joinedAt: Date.now(),
    });

    const channel = store.get('general');
    expect(channel).not.toBeNull();
    expect(channel!.config.name).toBe('#general');
    expect(channel!.groupKey).toEqual(groupKey);
  });

  it('should update group key', async () => {
    const store = new ChannelStore(db);
    const id = await generateIdentity('alice');
    const oldKey = generateGroupKey();
    const newKey = generateGroupKey();

    store.save({
      config: {
        id: 'general',
        name: '#general',
        creatorPubKey: id.publicKey,
        vouchThreshold: 2,
        createdAt: Date.now(),
      },
      groupKey: oldKey,
      joinedAt: Date.now(),
    });

    store.updateGroupKey('general', newKey);

    const channel = store.get('general');
    expect(channel!.groupKey).toEqual(newKey);
  });
});

describe('MessageStore', () => {
  it('should save and retrieve messages', () => {
    const store = new MessageStore(db);
    const channelStore = new ChannelStore(db);

    // Create channel first (foreign key constraint)
    channelStore.save({
      config: {
        id: 'general',
        name: '#general',
        creatorPubKey: new Uint8Array(32),
        vouchThreshold: 2,
        createdAt: Date.now(),
      },
      groupKey: generateGroupKey(),
      joinedAt: Date.now(),
    });

    store.save({
      channelId: 'general',
      senderPubKey: new Uint8Array(32),
      ciphertext: new Uint8Array([1, 2, 3]),
      nonce: new Uint8Array(24),
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      messageId: 'msg-1',
    });

    const msgs = store.getByChannel('general');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('msg-1');
  });

  it('should check message existence', () => {
    const store = new MessageStore(db);
    const channelStore = new ChannelStore(db);

    channelStore.save({
      config: {
        id: 'general',
        name: '#general',
        creatorPubKey: new Uint8Array(32),
        vouchThreshold: 2,
        createdAt: Date.now(),
      },
      groupKey: generateGroupKey(),
      joinedAt: Date.now(),
    });

    store.save({
      channelId: 'general',
      senderPubKey: new Uint8Array(32),
      ciphertext: new Uint8Array([1, 2, 3]),
      nonce: new Uint8Array(24),
      signature: new Uint8Array(64),
      timestamp: Date.now(),
      messageId: 'msg-1',
    });

    expect(store.exists('msg-1')).toBe(true);
    expect(store.exists('msg-2')).toBe(false);
  });
});
