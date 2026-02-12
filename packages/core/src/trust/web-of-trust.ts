import type Database from 'better-sqlite3';
import { signMessage, verifySignature, pubKeyToHex } from '../crypto/identity.js';
import type { Vouch, JoinRequest } from '../types.js';

export class WebOfTrust {
  constructor(private db: Database.Database) {}

  async createVouch(
    voucherPrivKey: Uint8Array,
    voucherPubKey: Uint8Array,
    voucheePubKey: Uint8Array,
    channelId: string
  ): Promise<Vouch> {
    const timestamp = Date.now();
    const payload = new TextEncoder().encode(
      JSON.stringify({
        voucherPubKey: Array.from(voucherPubKey),
        voucheePubKey: Array.from(voucheePubKey),
        channelId,
        timestamp,
      })
    );
    const signature = await signMessage(voucherPrivKey, payload);

    const vouch: Vouch = {
      voucherPubKey,
      voucheePubKey,
      channelId,
      timestamp,
      signature,
    };

    this.saveVouch(vouch);
    return vouch;
  }

  async verifyVouch(vouch: Vouch): Promise<boolean> {
    const payload = new TextEncoder().encode(
      JSON.stringify({
        voucherPubKey: Array.from(vouch.voucherPubKey),
        voucheePubKey: Array.from(vouch.voucheePubKey),
        channelId: vouch.channelId,
        timestamp: vouch.timestamp,
      })
    );
    return verifySignature(vouch.voucherPubKey, payload, vouch.signature);
  }

  saveVouch(vouch: Vouch): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO vouches
        (voucher_public_key, vouchee_public_key, channel_id, timestamp, signature)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Buffer.from(vouch.voucherPubKey),
      Buffer.from(vouch.voucheePubKey),
      vouch.channelId,
      vouch.timestamp,
      Buffer.from(vouch.signature)
    );

    // Update vouch count on join request
    this.db.prepare(`
      UPDATE join_requests
      SET vouches_received = (
        SELECT COUNT(*) FROM vouches
        WHERE vouchee_public_key = ? AND channel_id = ?
      )
      WHERE requester_public_key = ? AND channel_id = ?
    `).run(
      Buffer.from(vouch.voucheePubKey),
      vouch.channelId,
      Buffer.from(vouch.voucheePubKey),
      vouch.channelId
    );
  }

  getVouchCount(pubKey: Uint8Array, channelId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM vouches WHERE vouchee_public_key = ? AND channel_id = ?'
    ).get(Buffer.from(pubKey), channelId) as any;
    return row?.count ?? 0;
  }

  getVouchersFor(pubKey: Uint8Array, channelId: string): Uint8Array[] {
    const rows = this.db.prepare(
      'SELECT voucher_public_key FROM vouches WHERE vouchee_public_key = ? AND channel_id = ?'
    ).all(Buffer.from(pubKey), channelId) as any[];
    return rows.map(r => new Uint8Array(r.voucher_public_key));
  }

  hasVouched(voucherPubKey: Uint8Array, voucheePubKey: Uint8Array, channelId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM vouches WHERE voucher_public_key = ? AND vouchee_public_key = ? AND channel_id = ?'
    ).get(Buffer.from(voucherPubKey), Buffer.from(voucheePubKey), channelId);
    return !!row;
  }

  // Join requests
  createJoinRequest(requesterPubKey: Uint8Array, channelId: string): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO join_requests
        (requester_public_key, channel_id, timestamp, vouches_received, status)
      VALUES (?, ?, ?, 0, 'pending')
    `).run(Buffer.from(requesterPubKey), channelId, Date.now());
  }

  getJoinRequest(requesterPubKey: Uint8Array, channelId: string): JoinRequest | null {
    const row = this.db.prepare(
      'SELECT * FROM join_requests WHERE requester_public_key = ? AND channel_id = ?'
    ).get(Buffer.from(requesterPubKey), channelId) as any;
    if (!row) return null;
    return {
      requesterPubKey: new Uint8Array(row.requester_public_key),
      channelId: row.channel_id,
      timestamp: row.timestamp,
      vouchesReceived: row.vouches_received,
      status: row.status,
    };
  }

  getPendingRequests(channelId: string): JoinRequest[] {
    const rows = this.db.prepare(
      "SELECT * FROM join_requests WHERE channel_id = ? AND status = 'pending'"
    ).all(channelId) as any[];
    return rows.map(row => ({
      requesterPubKey: new Uint8Array(row.requester_public_key),
      channelId: row.channel_id,
      timestamp: row.timestamp,
      vouchesReceived: row.vouches_received,
      status: row.status as 'pending',
    }));
  }

  approveRequest(requesterPubKey: Uint8Array, channelId: string): void {
    this.db.prepare(
      "UPDATE join_requests SET status = 'approved' WHERE requester_public_key = ? AND channel_id = ?"
    ).run(Buffer.from(requesterPubKey), channelId);
  }

  // Trust graph: who has vouched for whom in a channel
  getTrustGraph(channelId: string): Array<{ voucher: string; vouchee: string }> {
    const rows = this.db.prepare(
      'SELECT voucher_public_key, vouchee_public_key FROM vouches WHERE channel_id = ?'
    ).all(channelId) as any[];
    return rows.map(r => ({
      voucher: pubKeyToHex(new Uint8Array(r.voucher_public_key)),
      vouchee: pubKeyToHex(new Uint8Array(r.vouchee_public_key)),
    }));
  }
}
