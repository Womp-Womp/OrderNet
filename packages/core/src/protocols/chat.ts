import type { GossipSub } from '@chainsafe/libp2p-gossipsub';
import {
  encryptMessage,
  decryptMessage,
  serializeEncryptedMessage,
  deserializeEncryptedMessage,
} from '../crypto/messages.js';
import { pubKeyToHex } from '../crypto/identity.js';
import type { ChannelManager } from '../channels/manager.js';
import type { MessageStore } from '../storage/messages.js';
import type { Identity, PlainMessage, OrderNetEvent } from '../types.js';

const TOPIC_PREFIX = '/ordernet/chat/1.0.0/';

export function channelTopic(channelId: string): string {
  return `${TOPIC_PREFIX}${channelId}`;
}

export class ChatProtocol {
  constructor(
    private pubsub: GossipSub,
    private channelManager: ChannelManager,
    private messageStore: MessageStore,
    private identity: Identity,
    private onEvent: (event: OrderNetEvent) => void
  ) {}

  start(): void {
    this.pubsub.addEventListener('gossipsub:message', (evt) => {
      const { msg } = evt.detail;
      const topic = msg.topic;
      if (!topic.startsWith(TOPIC_PREFIX)) return;

      const channelId = topic.slice(TOPIC_PREFIX.length);
      this.handleIncoming(channelId, msg.data).catch(err => {
        this.onEvent({ type: 'error', error: `Chat recv error: ${err}` });
      });
    });
  }

  subscribeToChannel(channelId: string): void {
    this.pubsub.subscribe(channelTopic(channelId));
  }

  unsubscribeFromChannel(channelId: string): void {
    this.pubsub.unsubscribe(channelTopic(channelId));
  }

  async sendMessage(channelId: string, content: string): Promise<PlainMessage | null> {
    const channel = this.channelManager.getChannel(channelId);
    if (!channel) return null;
    const me = pubKeyToHex(this.identity.publicKey);
    if (!this.channelManager.hasAccess(channelId, me)) {
      this.onEvent({ type: 'error', error: `Access denied for #${channelId}` });
      return null;
    }

    const encrypted = await encryptMessage(
      content,
      channelId,
      channel.groupKey,
      this.identity.publicKey,
      this.identity.privateKey,
      this.identity.nickname
    );

    const data = serializeEncryptedMessage(encrypted);
    await this.pubsub.publish(channelTopic(channelId), data);

    // Store locally
    this.messageStore.save(encrypted);

    return {
      content,
      senderPubKey: this.identity.publicKey,
      senderNick: this.identity.nickname,
      timestamp: encrypted.timestamp,
      channelId,
      messageId: encrypted.messageId,
    };
  }

  private async handleIncoming(channelId: string, data: Uint8Array): Promise<void> {
    const encrypted = deserializeEncryptedMessage(data);

    // Skip if we already have this message
    if (this.messageStore.exists(encrypted.messageId)) return;

    const channel = this.channelManager.getChannel(channelId);
    if (!channel) return;

    const plain = await decryptMessage(encrypted, channel.groupKey);
    if (!plain) return;
    const sender = pubKeyToHex(plain.senderPubKey);
    if (!this.channelManager.hasAccess(channelId, sender)) return;

    this.messageStore.save(encrypted);
    this.onEvent({ type: 'message', message: plain });
  }
}
