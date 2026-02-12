import type { Libp2p } from 'libp2p';
import type { Stream, Connection } from '@libp2p/interface';
import { decryptGroupKeyFromPeer } from '../crypto/group-keys.js';
import { verifySignature } from '../crypto/identity.js';
import type { ChannelManager } from '../channels/manager.js';
import type { InviteManager } from '../trust/invite.js';
import type { Identity, KeyExchangePayload, OrderNetEvent } from '../types.js';

const KEYEX_PROTOCOL = '/ordernet/keyex/1.0.0';

export class KeyExchangeProtocol {
  constructor(
    private node: Libp2p,
    private channelManager: ChannelManager,
    private inviteManager: InviteManager,
    private identity: Identity,
    private onEvent: (event: OrderNetEvent) => void
  ) {}

  start(): void {
    this.node.handle(KEYEX_PROTOCOL, async ({ stream, connection }) => {
      try {
        await this.handleIncoming(stream, connection);
      } catch (err) {
        this.onEvent({ type: 'error', error: `KeyEx protocol error: ${err}` });
      }
    });
  }

  stop(): void {
    this.node.unhandle(KEYEX_PROTOCOL).catch(() => {});
  }

  async sendGroupKey(peerId: string, channelId: string, recipientPubKey: Uint8Array): Promise<void> {
    const payload = await this.inviteManager.createKeyExchange(recipientPubKey, channelId);
    if (!payload) return;

    const stream = await this.node.dialProtocol(peerId as any, KEYEX_PROTOCOL);
    const msg = JSON.stringify({
      senderPubKey: Array.from(payload.senderPubKey),
      recipientPubKey: Array.from(payload.recipientPubKey),
      channelId: payload.channelId,
      encryptedGroupKey: Array.from(payload.encryptedGroupKey),
      ephemeralPubKey: Array.from(payload.ephemeralPubKey),
      nonce: Array.from(payload.nonce),
      timestamp: payload.timestamp,
      signature: Array.from(payload.signature),
    });
    const data = new TextEncoder().encode(msg);
    const writer = stream.writable.getWriter();
    await writer.write(data);
    await writer.close();
  }

  private async handleIncoming(stream: Stream, _connection: Connection): Promise<void> {
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const data = concatUint8Arrays(chunks);
    const json = JSON.parse(new TextDecoder().decode(data));

    const recipientPubKey = new Uint8Array(json.recipientPubKey);

    // Verify this is meant for us
    if (!uint8ArraysEqual(recipientPubKey, this.identity.publicKey)) return;

    // Decrypt the group key
    const groupKey = decryptGroupKeyFromPeer(
      new Uint8Array(json.encryptedGroupKey),
      this.identity.privateKey,
      new Uint8Array(json.ephemeralPubKey),
      new Uint8Array(json.nonce)
    );

    // Join the channel with the received group key
    this.channelManager.joinChannel(
      {
        id: json.channelId,
        name: `#${json.channelId}`,
        creatorPubKey: new Uint8Array(json.senderPubKey),
        vouchThreshold: 2,
        createdAt: json.timestamp,
      },
      groupKey
    );

    this.onEvent({
      type: 'key-received',
      channelId: json.channelId,
    });
  }
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
