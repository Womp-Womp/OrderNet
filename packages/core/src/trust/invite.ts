import { getFingerprint, pubKeyToHex } from '../crypto/identity.js';
import { encryptGroupKeyForPeer } from '../crypto/group-keys.js';
import type { WebOfTrust } from './web-of-trust.js';
import type { ChannelStore } from '../storage/channels.js';
import type { Identity, KeyExchangePayload } from '../types.js';
import { signMessage } from '../crypto/identity.js';

export class InviteManager {
  constructor(
    private trust: WebOfTrust,
    private channelStore: ChannelStore,
    private identity: Identity
  ) {}

  getInviteFingerprint(): string {
    return getFingerprint(this.identity.publicKey);
  }

  getInvitePubKeyHex(): string {
    return pubKeyToHex(this.identity.publicKey);
  }

  async processVouchAndCheckThreshold(
    voucheePubKey: Uint8Array,
    channelId: string
  ): Promise<{ approved: boolean; vouchCount: number; threshold: number }> {
    const channel = this.channelStore.get(channelId);
    if (!channel) {
      return { approved: false, vouchCount: 0, threshold: 0 };
    }

    const vouchCount = this.trust.getVouchCount(voucheePubKey, channelId);
    const threshold = channel.config.vouchThreshold;
    const approved = vouchCount >= threshold;

    if (approved) {
      this.trust.approveRequest(voucheePubKey, channelId);
    }

    return { approved, vouchCount, threshold };
  }

  async createKeyExchange(
    recipientPubKey: Uint8Array,
    channelId: string
  ): Promise<KeyExchangePayload | null> {
    const channel = this.channelStore.get(channelId);
    if (!channel) return null;

    const { encryptedKey, ephemeralPub, nonce } = encryptGroupKeyForPeer(
      channel.groupKey,
      this.identity.privateKey,
      recipientPubKey
    );

    const payload = new TextEncoder().encode(
      JSON.stringify({
        senderPubKey: Array.from(this.identity.publicKey),
        recipientPubKey: Array.from(recipientPubKey),
        channelId,
        timestamp: Date.now(),
      })
    );
    const signature = await signMessage(this.identity.privateKey, payload);

    return {
      senderPubKey: this.identity.publicKey,
      recipientPubKey,
      channelId,
      encryptedGroupKey: encryptedKey,
      ephemeralPubKey: ephemeralPub,
      nonce,
      timestamp: Date.now(),
      signature,
    };
  }
}
