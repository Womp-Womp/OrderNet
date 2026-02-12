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
    const accessMode = channel.config.accessMode ?? 'public';
    const inviteOnly = channel.config.inviteOnly ? 1 : 0;
    const allowedMembers = JSON.stringify(channel.config.allowedMembers ?? []);

    this.db.prepare(`
      INSERT INTO channels
        (id, name, group_key, creator_public_key, vouch_threshold, access_mode, invite_only, allowed_members, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        group_key = excluded.group_key,
        name = excluded.name,
        vouch_threshold = excluded.vouch_threshold,
        access_mode = excluded.access_mode,
        invite_only = excluded.invite_only,
        allowed_members = excluded.allowed_members
    `).run(
      channel.config.id,
      channel.config.name,
      Buffer.from(channel.groupKey),
      Buffer.from(channel.config.creatorPubKey),
      channel.config.vouchThreshold,
      accessMode,
      inviteOnly,
      allowedMembers,
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
        accessMode: row.access_mode ?? 'public',
        inviteOnly: !!row.invite_only,
        allowedMembers: parseAllowedMembers(row.allowed_members),
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
        accessMode: row.access_mode ?? 'public',
        inviteOnly: !!row.invite_only,
        allowedMembers: parseAllowedMembers(row.allowed_members),
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

function parseAllowedMembers(raw: unknown): string[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v) => typeof v === 'string');
  } catch {
    return [];
  }
}
