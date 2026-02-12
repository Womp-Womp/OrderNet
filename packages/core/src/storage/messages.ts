import type Database from 'better-sqlite3';
import type { EncryptedMessage } from '../types.js';

export class MessageStore {
  constructor(private db: Database.Database) {}

  save(msg: EncryptedMessage): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO messages
        (channel_id, sender_public_key, content_encrypted, nonce, signature, timestamp, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.channelId,
      Buffer.from(msg.senderPubKey),
      Buffer.from(msg.ciphertext),
      Buffer.from(msg.nonce),
      Buffer.from(msg.signature),
      msg.timestamp,
      msg.messageId
    );
  }

  getByChannel(channelId: string, limit = 100, before?: number): EncryptedMessage[] {
    const query = before
      ? 'SELECT * FROM messages WHERE channel_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?'
      : 'SELECT * FROM messages WHERE channel_id = ? ORDER BY timestamp DESC LIMIT ?';

    const params = before
      ? [channelId, before, limit]
      : [channelId, limit];

    const rows = this.db.prepare(query).all(...params) as any[];

    return rows.reverse().map(row => ({
      channelId: row.channel_id,
      senderPubKey: new Uint8Array(row.sender_public_key),
      ciphertext: new Uint8Array(row.content_encrypted),
      nonce: new Uint8Array(row.nonce),
      signature: new Uint8Array(row.signature),
      timestamp: row.timestamp,
      messageId: row.message_id,
    }));
  }

  exists(messageId: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM messages WHERE message_id = ?'
    ).get(messageId);
    return !!row;
  }

  deleteByChannel(channelId: string): void {
    this.db.prepare('DELETE FROM messages WHERE channel_id = ?').run(channelId);
  }
}
