import type { Libp2p } from 'libp2p';
import type { Connection, Stream } from '@libp2p/interface';
import { signMessage, verifySignature, pubKeyToHex } from '../crypto/identity.js';
import type { WebOfTrust } from '../trust/web-of-trust.js';
import type { InviteManager } from '../trust/invite.js';
import type { Identity, Vouch, OrderNetEvent } from '../types.js';

const VOUCH_PROTOCOL = '/ordernet/vouch/1.0.0';

export class VouchProtocol {
  constructor(
    private node: Libp2p,
    private trust: WebOfTrust,
    private inviteManager: InviteManager,
    private identity: Identity,
    private onEvent: (event: OrderNetEvent) => void
  ) {}

  start(): void {
    this.node.handle(VOUCH_PROTOCOL, async ({ stream, connection }) => {
      try {
        await this.handleIncoming(stream, connection);
      } catch (err) {
        this.onEvent({ type: 'error', error: `Vouch protocol error: ${err}` });
      }
    });
  }

  stop(): void {
    this.node.unhandle(VOUCH_PROTOCOL).catch(() => {});
  }

  async sendJoinRequest(peerId: string, channelId: string): Promise<void> {
    const stream = await this.node.dialProtocol(peerId as any, VOUCH_PROTOCOL);
    const msg = JSON.stringify({
      type: 'join_request',
      requesterPubKey: Array.from(this.identity.publicKey),
      nickname: this.identity.nickname,
      channelId,
      timestamp: Date.now(),
    });
    const data = new TextEncoder().encode(msg);
    const writer = stream.writable.getWriter();
    await writer.write(data);
    await writer.close();
  }

  async sendVouch(peerId: string, vouch: Vouch): Promise<void> {
    const stream = await this.node.dialProtocol(peerId as any, VOUCH_PROTOCOL);
    const msg = JSON.stringify({
      type: 'vouch',
      voucherPubKey: Array.from(vouch.voucherPubKey),
      voucheePubKey: Array.from(vouch.voucheePubKey),
      channelId: vouch.channelId,
      timestamp: vouch.timestamp,
      signature: Array.from(vouch.signature),
    });
    const data = new TextEncoder().encode(msg);
    const writer = stream.writable.getWriter();
    await writer.write(data);
    await writer.close();
  }

  private async handleIncoming(stream: Stream, connection: Connection): Promise<void> {
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const data = concatUint8Arrays(chunks);
    const json = JSON.parse(new TextDecoder().decode(data));

    if (json.type === 'join_request') {
      const requesterPubKey = new Uint8Array(json.requesterPubKey);
      this.trust.createJoinRequest(requesterPubKey, json.channelId);
      this.onEvent({
        type: 'join-request',
        request: {
          requesterPubKey,
          channelId: json.channelId,
          timestamp: json.timestamp,
          vouchesReceived: 0,
          status: 'pending',
        },
      });
    } else if (json.type === 'vouch') {
      const vouch: Vouch = {
        voucherPubKey: new Uint8Array(json.voucherPubKey),
        voucheePubKey: new Uint8Array(json.voucheePubKey),
        channelId: json.channelId,
        timestamp: json.timestamp,
        signature: new Uint8Array(json.signature),
      };

      const valid = await this.trust.verifyVouch(vouch);
      if (valid) {
        this.trust.saveVouch(vouch);
        this.onEvent({ type: 'vouch-received', vouch });

        // Check if threshold is met
        const result = await this.inviteManager.processVouchAndCheckThreshold(
          vouch.voucheePubKey,
          vouch.channelId
        );
        if (result.approved) {
          // Trigger key exchange
          this.onEvent({
            type: 'channel-joined',
            channelId: vouch.channelId,
          });
        }
      }
    }
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
