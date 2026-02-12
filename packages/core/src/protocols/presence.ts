import type { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { signMessage, verifySignature, pubKeyToHex } from '../crypto/identity.js';
import type { ChannelManager } from '../channels/manager.js';
import type { PeerStore } from '../storage/peers.js';
import type { Identity, PresenceAnnouncement, OrderNetEvent } from '../types.js';

const PRESENCE_TOPIC = '/ordernet/presence/1.0.0';
const ANNOUNCE_INTERVAL = 30_000; // 30 seconds

export class PresenceProtocol {
  private intervalHandle?: ReturnType<typeof setInterval>;
  private onlinePeers = new Map<string, { nickname: string; lastSeen: number }>();

  constructor(
    private pubsub: GossipSub,
    private channelManager: ChannelManager,
    private peerStore: PeerStore,
    private identity: Identity,
    private onEvent: (event: OrderNetEvent) => void
  ) {}

  start(): void {
    this.pubsub.subscribe(PRESENCE_TOPIC);

    this.pubsub.addEventListener('gossipsub:message', (evt) => {
      const { msg } = evt.detail;
      if (msg.topic !== PRESENCE_TOPIC) return;
      this.handleAnnouncement(msg.data).catch(() => {});
    });

    // Announce immediately, then periodically
    this.announce().catch(() => {});
    this.intervalHandle = setInterval(() => {
      this.announce().catch(() => {});
    }, ANNOUNCE_INTERVAL);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.pubsub.unsubscribe(PRESENCE_TOPIC);
  }

  async announce(): Promise<void> {
    const channels = this.channelManager.getChannelIds();
    const timestamp = Date.now();
    const payload = new TextEncoder().encode(
      JSON.stringify({
        pubKey: Array.from(this.identity.publicKey),
        nickname: this.identity.nickname,
        timestamp,
        channels,
      })
    );

    const signature = await signMessage(this.identity.privateKey, payload);

    const announcement: PresenceAnnouncement = {
      pubKey: this.identity.publicKey,
      nickname: this.identity.nickname,
      timestamp,
      channels,
      signature,
    };

    const data = new TextEncoder().encode(JSON.stringify({
      pubKey: Array.from(announcement.pubKey),
      nickname: announcement.nickname,
      timestamp: announcement.timestamp,
      channels: announcement.channels,
      signature: Array.from(announcement.signature),
    }));

    await this.pubsub.publish(PRESENCE_TOPIC, data);
  }

  private async handleAnnouncement(data: Uint8Array): Promise<void> {
    const json = JSON.parse(new TextDecoder().decode(data));
    const pubKey = new Uint8Array(json.pubKey);
    const signature = new Uint8Array(json.signature);

    const payload = new TextEncoder().encode(
      JSON.stringify({
        pubKey: json.pubKey,
        nickname: json.nickname,
        timestamp: json.timestamp,
        channels: json.channels,
      })
    );

    const valid = await verifySignature(pubKey, payload, signature);
    if (!valid) return;

    const hexKey = pubKeyToHex(pubKey);

    // Skip our own announcements
    if (hexKey === pubKeyToHex(this.identity.publicKey)) return;

    const isNew = !this.onlinePeers.has(hexKey);
    this.onlinePeers.set(hexKey, {
      nickname: json.nickname,
      lastSeen: json.timestamp,
    });

    // Update peer store
    this.peerStore.upsert({
      publicKey: pubKey,
      nickname: json.nickname,
      firstSeen: json.timestamp,
      lastSeen: json.timestamp,
      addresses: [],
    });

    if (isNew) {
      this.onEvent({
        type: 'peer-joined',
        pubKey: hexKey,
        nickname: json.nickname,
      });
    }

    this.onEvent({
      type: 'presence',
      announcement: {
        pubKey,
        nickname: json.nickname,
        timestamp: json.timestamp,
        channels: json.channels,
        signature,
      },
    });
  }

  getOnlinePeers(): Map<string, { nickname: string; lastSeen: number }> {
    // Prune stale peers (not seen in 2 minutes)
    const now = Date.now();
    for (const [key, info] of this.onlinePeers) {
      if (now - info.lastSeen > 120_000) {
        this.onlinePeers.delete(key);
        this.onEvent({ type: 'peer-left', pubKey: key });
      }
    }
    return new Map(this.onlinePeers);
  }
}
