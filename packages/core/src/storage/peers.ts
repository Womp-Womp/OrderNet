import type Database from 'better-sqlite3';
import type { PeerInfo } from '../types.js';

export class PeerStore {
  constructor(private db: Database.Database) {}

  upsert(peer: PeerInfo): void {
    this.db.prepare(`
      INSERT INTO peers (public_key, nickname, first_seen, last_seen, addresses)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(public_key) DO UPDATE SET
        nickname = excluded.nickname,
        last_seen = excluded.last_seen,
        addresses = excluded.addresses
    `).run(
      Buffer.from(peer.publicKey),
      peer.nickname,
      peer.firstSeen,
      peer.lastSeen,
      JSON.stringify(peer.addresses)
    );
  }

  get(publicKey: Uint8Array): PeerInfo | null {
    const row = this.db.prepare(
      'SELECT * FROM peers WHERE public_key = ?'
    ).get(Buffer.from(publicKey)) as any;
    if (!row) return null;
    return {
      publicKey: new Uint8Array(row.public_key),
      nickname: row.nickname,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      addresses: JSON.parse(row.addresses || '[]'),
    };
  }

  getAll(): PeerInfo[] {
    const rows = this.db.prepare('SELECT * FROM peers').all() as any[];
    return rows.map(row => ({
      publicKey: new Uint8Array(row.public_key),
      nickname: row.nickname,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      addresses: JSON.parse(row.addresses || '[]'),
    }));
  }

  updateLastSeen(publicKey: Uint8Array, timestamp: number): void {
    this.db.prepare(
      'UPDATE peers SET last_seen = ? WHERE public_key = ?'
    ).run(timestamp, Buffer.from(publicKey));
  }

  delete(publicKey: Uint8Array): void {
    this.db.prepare('DELETE FROM peers WHERE public_key = ?')
      .run(Buffer.from(publicKey));
  }
}
