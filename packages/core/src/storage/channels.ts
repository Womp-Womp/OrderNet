import type Database from 'better-sqlite3';
import type { ChannelConfig } from '../types.js';

export interface StoredChannel {
  config: ChannelConfig;
  groupKey: Uint8Array;
  joinedAt: number;
}

export class ChannelStore {
  constructor(private db: Database.Database) {}

  save(channel: StoredChannel): void {
    this.db.prepare(`
      INSERT INTO channels (id, name, group_key, creator_public_key, vouch_threshold, joined_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        group_key = excluded.group_key,
        name = excluded.name
    `).run(
      channel.config.id,
      channel.config.name,
      Buffer.from(channel.groupKey),
      Buffer.from(channel.config.creatorPubKey),
      channel.config.vouchThreshold,
      channel.joinedAt
    );
  }

  get(channelId: string): StoredChannel | null {
    const row = this.db.prepare(
      'SELECT * FROM channels WHERE id = ?'
    ).get(channelId) as any;
    if (!row) return null;
    return {
      config: {
        id: row.id,
        name: row.name,
        creatorPubKey: new Uint8Array(row.creator_public_key),
        vouchThreshold: row.vouch_threshold,
        createdAt: row.joined_at,
      },
      groupKey: new Uint8Array(row.group_key),
      joinedAt: row.joined_at,
    };
  }

  getAll(): StoredChannel[] {
    const rows = this.db.prepare('SELECT * FROM channels').all() as any[];
    return rows.map(row => ({
      config: {
        id: row.id,
        name: row.name,
        creatorPubKey: new Uint8Array(row.creator_public_key),
        vouchThreshold: row.vouch_threshold,
        createdAt: row.joined_at,
      },
      groupKey: new Uint8Array(row.group_key),
      joinedAt: row.joined_at,
    }));
  }

  updateGroupKey(channelId: string, newKey: Uint8Array): void {
    this.db.prepare(
      'UPDATE channels SET group_key = ? WHERE id = ?'
    ).run(Buffer.from(newKey), channelId);
  }

  delete(channelId: string): void {
    this.db.prepare('DELETE FROM channels WHERE id = ?').run(channelId);
  }
}
