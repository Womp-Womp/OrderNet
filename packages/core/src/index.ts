export { OrderNetNode } from './node.js';
export type { OrderNetNodeConfig } from './node.js';

// Types
export type {
  Identity,
  EncryptedMessage,
  PlainMessage,
  Vouch,
  ChannelConfig,
  ChannelAccessMode,
  ChannelState,
  PeerInfo,
  JoinRequest,
  PresenceAnnouncement,
  KeyExchangePayload,
  DirectMessage,
  OrderNetEvent,
} from './types.js';

// Crypto utilities
export {
  generateIdentity,
  signMessage,
  verifySignature,
  getFingerprint,
  pubKeyToHex,
  hexToPubKey,
  encryptPrivateKey,
  decryptPrivateKey,
} from './crypto/identity.js';

export {
  generateGroupKey,
  encryptGroupKeyForPeer,
  decryptGroupKeyFromPeer,
} from './crypto/group-keys.js';

export {
  encryptMessage,
  decryptMessage,
  serializeEncryptedMessage,
  deserializeEncryptedMessage,
} from './crypto/messages.js';

// Storage
export { openDatabase } from './storage/db.js';
export { MessageStore } from './storage/messages.js';
export { PeerStore } from './storage/peers.js';
export { ChannelStore } from './storage/channels.js';

// Channels
export { ChannelManager } from './channels/manager.js';
export {
  createChannelState,
  addMember,
  removeMember,
  isMember,
  isCreator,
} from './channels/channel.js';

// Trust
export { WebOfTrust } from './trust/web-of-trust.js';
export { InviteManager } from './trust/invite.js';
