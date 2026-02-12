import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { tcp } from '@libp2p/tcp';
import { mdns } from '@libp2p/mdns';
import { identify } from '@libp2p/identify';
import { EventEmitter } from 'events';

import { openDatabase } from './storage/db.js';
import { MessageStore } from './storage/messages.js';
import { PeerStore as OrderNetPeerStore } from './storage/peers.js';
import { ChannelStore } from './storage/channels.js';
import { ChannelManager } from './channels/manager.js';
import { WebOfTrust } from './trust/web-of-trust.js';
import { InviteManager } from './trust/invite.js';
import { ChatProtocol } from './protocols/chat.js';
import { PresenceProtocol } from './protocols/presence.js';
import { VouchProtocol } from './protocols/vouch.js';
import { KeyExchangeProtocol } from './protocols/key-exchange.js';
import {
  generateIdentity,
  getFingerprint,
  pubKeyToHex,
  encryptPrivateKey,
  decryptPrivateKey,
} from './crypto/identity.js';
import type {
  Identity,
  OrderNetEvent,
  PlainMessage,
  EncryptedMessage,
} from './types.js';
import { decryptMessage } from './crypto/messages.js';

import type { Libp2p } from 'libp2p';
import type { GossipSub } from '@chainsafe/libp2p-gossipsub';
import type Database from 'better-sqlite3';

export interface OrderNetNodeConfig {
  dbPath?: string;
  listenPort?: number;
  nickname?: string;
  passphrase?: string;
  bootstrapPeers?: string[];
}

export class OrderNetNode extends EventEmitter {
  private libp2p!: Libp2p;
  private db!: Database.Database;
  private identity!: Identity;
  private messageStore!: MessageStore;
  private peerStore!: OrderNetPeerStore;
  private channelStore!: ChannelStore;
  private channelManager!: ChannelManager;
  private trust!: WebOfTrust;
  private inviteManager!: InviteManager;
  private chatProtocol!: ChatProtocol;
  private presenceProtocol!: PresenceProtocol;
  private vouchProtocol!: VouchProtocol;
  private keyExProtocol!: KeyExchangeProtocol;

  private config: OrderNetNodeConfig;
  private started = false;

  constructor(config: OrderNetNodeConfig = {}) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.started) return;

    // Initialize database
    this.db = openDatabase(this.config.dbPath);
    this.messageStore = new MessageStore(this.db);
    this.peerStore = new OrderNetPeerStore(this.db);
    this.channelStore = new ChannelStore(this.db);

    // Load or create identity
    this.identity = await this.loadOrCreateIdentity();

    // Initialize channel manager
    this.channelManager = new ChannelManager(this.channelStore, this.identity);

    // Initialize trust
    this.trust = new WebOfTrust(this.db);
    this.inviteManager = new InviteManager(this.trust, this.channelStore, this.identity);

    // Create libp2p node
    const port = this.config.listenPort ?? 0;
    this.libp2p = await createLibp2p({
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${port}`],
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [mdns()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          emitSelf: false,
          allowPublishToZeroTopicPeers: true,
        }) as any,
      },
    }) as any;

    const pubsub = this.libp2p.services.pubsub as unknown as GossipSub;

    // Event handler
    const onEvent = (event: OrderNetEvent) => {
      this.emit('event', event);
      this.emit(event.type, event);
    };

    // Initialize protocols
    this.chatProtocol = new ChatProtocol(
      pubsub,
      this.channelManager,
      this.messageStore,
      this.identity,
      onEvent
    );

    this.presenceProtocol = new PresenceProtocol(
      pubsub,
      this.channelManager,
      this.peerStore,
      this.identity,
      onEvent
    );

    this.vouchProtocol = new VouchProtocol(
      this.libp2p,
      this.trust,
      this.inviteManager,
      this.identity,
      onEvent
    );

    this.keyExProtocol = new KeyExchangeProtocol(
      this.libp2p,
      this.channelManager,
      this.inviteManager,
      this.identity,
      onEvent
    );

    // Start the node
    await this.libp2p.start();

    // Start protocols
    this.chatProtocol.start();
    this.presenceProtocol.start();
    this.vouchProtocol.start();
    this.keyExProtocol.start();

    // Subscribe to existing channels
    for (const channelId of this.channelManager.getChannelIds()) {
      this.chatProtocol.subscribeToChannel(channelId);
    }

    this.started = true;

    // Log addresses
    const addrs = this.libp2p.getMultiaddrs();
    this.emit('started', {
      peerId: this.libp2p.peerId.toString(),
      addresses: addrs.map(a => a.toString()),
      fingerprint: getFingerprint(this.identity.publicKey),
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.presenceProtocol.stop();
    this.vouchProtocol.stop();
    this.keyExProtocol.stop();
    await this.libp2p.stop();
    this.db.close();
    this.started = false;
  }

  // --- Public API ---

  async sendMessage(channelId: string, content: string): Promise<PlainMessage | null> {
    return this.chatProtocol.sendMessage(channelId, content);
  }

  createChannel(name: string, vouchThreshold = 2): void {
    const state = this.channelManager.createChannel(name, vouchThreshold);
    this.chatProtocol.subscribeToChannel(state.config.id);
  }

  leaveChannel(channelId: string): void {
    this.chatProtocol.unsubscribeFromChannel(channelId);
    this.channelManager.leaveChannel(channelId);
  }

  getChannels(): Array<{ id: string; name: string }> {
    return this.channelManager.getAllChannels().map(ch => ({
      id: ch.config.id,
      name: ch.config.name,
    }));
  }

  getChannelMembers(channelId: string): string[] {
    const ch = this.channelManager.getChannel(channelId);
    if (!ch) return [];
    return Array.from(ch.members);
  }

  async getChannelHistory(channelId: string, limit = 100): Promise<PlainMessage[]> {
    const channel = this.channelManager.getChannel(channelId);
    if (!channel) return [];

    const encrypted = this.messageStore.getByChannel(channelId, limit);
    const messages: PlainMessage[] = [];

    for (const enc of encrypted) {
      const plain = await decryptMessage(enc, channel.groupKey);
      if (plain) messages.push(plain);
    }
    return messages;
  }

  getOnlinePeers(): Map<string, { nickname: string; lastSeen: number }> {
    return this.presenceProtocol.getOnlinePeers();
  }

  async vouchForPeer(voucheePubKey: Uint8Array, channelId: string): Promise<void> {
    await this.trust.createVouch(
      this.identity.privateKey,
      this.identity.publicKey,
      voucheePubKey,
      channelId
    );
  }

  getPendingJoinRequests(channelId: string) {
    return this.trust.getPendingRequests(channelId);
  }

  getTrustGraph(channelId: string) {
    return this.trust.getTrustGraph(channelId);
  }

  getIdentity() {
    return {
      publicKey: this.identity.publicKey,
      nickname: this.identity.nickname,
      fingerprint: getFingerprint(this.identity.publicKey),
      pubKeyHex: pubKeyToHex(this.identity.publicKey),
    };
  }

  getPeerId(): string {
    return this.libp2p.peerId.toString();
  }

  getAddresses(): string[] {
    return this.libp2p.getMultiaddrs().map(a => a.toString());
  }

  getPeerCount(): number {
    return this.libp2p.getPeers().length;
  }

  setNickname(nick: string): void {
    this.identity.nickname = nick;
    // Persist nickname change
    this.db.prepare('UPDATE identity SET nickname = ? WHERE id = 1').run(nick);
  }

  // --- Identity Management ---

  private async loadOrCreateIdentity(): Promise<Identity> {
    const row = this.db.prepare('SELECT * FROM identity WHERE id = 1').get() as any;

    if (row) {
      const passphrase = this.config.passphrase ?? 'ordernet-default';
      const privateKey = decryptPrivateKey(
        new Uint8Array(row.private_key_encrypted),
        passphrase,
        new Uint8Array(row.salt),
        new Uint8Array(row.nonce)
      );
      return {
        publicKey: new Uint8Array(row.public_key),
        privateKey,
        nickname: row.nickname,
      };
    }

    // Generate new identity
    const nickname = this.config.nickname ?? `user-${Math.random().toString(36).slice(2, 6)}`;
    const identity = await generateIdentity(nickname);

    // Encrypt and store
    const passphrase = this.config.passphrase ?? 'ordernet-default';
    const { encrypted, salt, nonce } = encryptPrivateKey(identity.privateKey, passphrase);

    this.db.prepare(`
      INSERT INTO identity (id, public_key, private_key_encrypted, salt, nonce, nickname)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(
      Buffer.from(identity.publicKey),
      Buffer.from(encrypted),
      Buffer.from(salt),
      Buffer.from(nonce),
      nickname
    );

    return identity;
  }
}
