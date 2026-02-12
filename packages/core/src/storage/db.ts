import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key BLOB NOT NULL,
  private_key_encrypted BLOB NOT NULL,
  salt BLOB NOT NULL,
  nonce BLOB NOT NULL,
  nickname TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS peers (
  public_key BLOB PRIMARY KEY,
  nickname TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER,
  addresses TEXT
);

CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_key BLOB NOT NULL,
  creator_public_key BLOB NOT NULL,
  vouch_threshold INTEGER DEFAULT 2,
  access_mode TEXT DEFAULT 'public',
  invite_only INTEGER DEFAULT 0,
  allowed_members TEXT,
  joined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  sender_public_key BLOB NOT NULL,
  content_encrypted BLOB NOT NULL,
  nonce BLOB NOT NULL,
  signature BLOB NOT NULL,
  timestamp INTEGER NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE TABLE IF NOT EXISTS vouches (
  voucher_public_key BLOB NOT NULL,
  vouchee_public_key BLOB NOT NULL,
  channel_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  signature BLOB NOT NULL,
  PRIMARY KEY (voucher_public_key, vouchee_public_key, channel_id)
);

CREATE TABLE IF NOT EXISTS join_requests (
  requester_public_key BLOB NOT NULL,
  channel_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  vouches_received INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  PRIMARY KEY (requester_public_key, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_id ON messages(message_id);
`;

export function getDataDir(): string {
  const dir = path.join(os.homedir(), '.ordernet');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function openDatabase(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(getDataDir(), 'ordernet.db');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  // Backward-compatible migrations for older local databases.
  try {
    db.exec("ALTER TABLE channels ADD COLUMN access_mode TEXT DEFAULT 'public'");
  } catch {}
  try {
    db.exec("ALTER TABLE channels ADD COLUMN invite_only INTEGER DEFAULT 0");
  } catch {}
  try {
    db.exec("ALTER TABLE channels ADD COLUMN allowed_members TEXT");
  } catch {}
}
