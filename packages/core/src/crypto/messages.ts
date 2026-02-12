import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { bytesToHex } from '@noble/hashes/utils';
import { signMessage, verifySignature } from './identity.js';
import type { EncryptedMessage, PlainMessage } from '../types.js';

export async function encryptMessage(
  content: string,
  channelId: string,
  groupKey: Uint8Array,
  senderPubKey: Uint8Array,
  senderPrivKey: Uint8Array,
  senderNick: string
): Promise<EncryptedMessage> {
  const timestamp = Date.now();
  const messageId = bytesToHex(randomBytes(16));
  const nonce = randomBytes(24);

  // Encode the plaintext (content + nick together for authenticated context)
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ content, senderNick })
  );

  // Encrypt with group key
  const cipher = xchacha20poly1305(groupKey, nonce);
  const ciphertext = cipher.encrypt(plaintext);

  // Sign the ciphertext for sender authentication
  const signature = await signMessage(senderPrivKey, ciphertext);

  return {
    nonce,
    ciphertext,
    senderPubKey,
    signature,
    timestamp,
    channelId,
    messageId,
  };
}

export async function decryptMessage(
  encrypted: EncryptedMessage,
  groupKey: Uint8Array
): Promise<PlainMessage | null> {
  // Verify signature first
  const valid = await verifySignature(
    encrypted.senderPubKey,
    encrypted.ciphertext,
    encrypted.signature
  );
  if (!valid) return null;

  try {
    const cipher = xchacha20poly1305(groupKey, encrypted.nonce);
    const plaintext = cipher.decrypt(encrypted.ciphertext);
    const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as {
      content: string;
      senderNick: string;
    };

    return {
      content: decoded.content,
      senderPubKey: encrypted.senderPubKey,
      senderNick: decoded.senderNick,
      timestamp: encrypted.timestamp,
      channelId: encrypted.channelId,
      messageId: encrypted.messageId,
    };
  } catch {
    return null;
  }
}

export function serializeEncryptedMessage(msg: EncryptedMessage): Uint8Array {
  const json = JSON.stringify({
    nonce: Array.from(msg.nonce),
    ciphertext: Array.from(msg.ciphertext),
    senderPubKey: Array.from(msg.senderPubKey),
    signature: Array.from(msg.signature),
    timestamp: msg.timestamp,
    channelId: msg.channelId,
    messageId: msg.messageId,
  });
  return new TextEncoder().encode(json);
}

export function deserializeEncryptedMessage(data: Uint8Array): EncryptedMessage {
  const json = JSON.parse(new TextDecoder().decode(data));
  return {
    nonce: new Uint8Array(json.nonce),
    ciphertext: new Uint8Array(json.ciphertext),
    senderPubKey: new Uint8Array(json.senderPubKey),
    signature: new Uint8Array(json.signature),
    timestamp: json.timestamp,
    channelId: json.channelId,
    messageId: json.messageId,
  };
}
