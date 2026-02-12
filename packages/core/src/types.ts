export interface Identity {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  nickname: string;
}

export interface EncryptedMessage {
  nonce: Uint8Array;       // 24 bytes
  ciphertext: Uint8Array;
  senderPubKey: Uint8Array; // 32 bytes
  signature: Uint8Array;
  timestamp: number;
  channelId: string;
  messageId: string;
}

export interface PlainMessage {
  content: string;
  senderPubKey: Uint8Array;
  senderNick: string;
  timestamp: number;
  channelId: string;
  messageId: string;
}

export interface Vouch {
  voucherPubKey: Uint8Array;
  voucheePubKey: Uint8Array;
  channelId: string;
  timestamp: number;
  signature: Uint8Array;
}

export type ChannelAccessMode = 'public' | 'private' | 'dm';

export interface ChannelConfig {
  id: string;
  name: string;
  creatorPubKey: Uint8Array;
  vouchThreshold: number;
  createdAt: number;
  accessMode?: ChannelAccessMode;
  inviteOnly?: boolean;
  allowedMembers?: string[]; // hex-encoded pubkeys
}

export interface ChannelState {
  config: ChannelConfig;
  groupKey: Uint8Array;
  members: Set<string>; // hex-encoded pubkeys
}

export interface PeerInfo {
  publicKey: Uint8Array;
  nickname: string;
  firstSeen: number;
  lastSeen: number;
  addresses: string[];
}

export interface JoinRequest {
  requesterPubKey: Uint8Array;
  channelId: string;
  timestamp: number;
  vouchesReceived: number;
  status: 'pending' | 'approved' | 'denied';
}

export interface PresenceAnnouncement {
  pubKey: Uint8Array;
  nickname: string;
  timestamp: number;
  channels: string[];
  signature: Uint8Array;
}

export interface KeyExchangePayload {
  senderPubKey: Uint8Array;
  recipientPubKey: Uint8Array;
  channelId: string;
  encryptedGroupKey: Uint8Array;
  ephemeralPubKey: Uint8Array;
  nonce: Uint8Array;
  timestamp: number;
  signature: Uint8Array;
}

export interface DirectMessage {
  senderPubKey: Uint8Array;
  recipientPubKey: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  ephemeralPubKey: Uint8Array;
  timestamp: number;
  signature: Uint8Array;
}

export type OrderNetEvent =
  | { type: 'message'; message: PlainMessage }
  | { type: 'peer-joined'; pubKey: string; nickname: string }
  | { type: 'peer-left'; pubKey: string }
  | { type: 'join-request'; request: JoinRequest }
  | { type: 'vouch-received'; vouch: Vouch }
  | { type: 'channel-joined'; channelId: string }
  | { type: 'key-received'; channelId: string }
  | { type: 'presence'; announcement: PresenceAnnouncement }
  | { type: 'dm'; message: PlainMessage }
  | { type: 'error'; error: string };
