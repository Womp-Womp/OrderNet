import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { argon2id } from '@noble/hashes/argon2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import type { Identity } from '../types.js';

// ed25519 requires sha512 sync
ed25519.etc.sha512Sync = (...msgs) => {
  const h = sha512.create();
  for (const msg of msgs) h.update(msg);
  return h.digest();
};

export async function generateIdentity(nickname: string): Promise<Identity> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return { publicKey, privateKey, nickname };
}

export async function signMessage(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  return ed25519.signAsync(message, privateKey);
}

export async function verifySignature(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  try {
    return await ed25519.verifyAsync(signature, message, publicKey);
  } catch {
    return false;
  }
}

export function getFingerprint(publicKey: Uint8Array): string {
  const hex = bytesToHex(publicKey);
  return hex.slice(0, 8) + '..' + hex.slice(-4);
}

export function pubKeyToHex(publicKey: Uint8Array): string {
  return bytesToHex(publicKey);
}

export function hexToPubKey(hex: string): Uint8Array {
  return hexToBytes(hex);
}

export function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Uint8Array {
  return argon2id(new TextEncoder().encode(passphrase), salt, {
    t: 3,
    m: 65536,
    p: 1,
    dkLen: 32,
  });
}

export function encryptPrivateKey(
  privateKey: Uint8Array,
  passphrase: string
): { encrypted: Uint8Array; salt: Uint8Array; nonce: Uint8Array } {
  const salt = randomBytes(16);
  const key = deriveKeyFromPassphrase(passphrase, salt);
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(key, nonce);
  const encrypted = cipher.encrypt(privateKey);
  return { encrypted, salt, nonce };
}

export function decryptPrivateKey(
  encrypted: Uint8Array,
  passphrase: string,
  salt: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  const key = deriveKeyFromPassphrase(passphrase, salt);
  const cipher = xchacha20poly1305(key, nonce);
  return cipher.decrypt(encrypted);
}
