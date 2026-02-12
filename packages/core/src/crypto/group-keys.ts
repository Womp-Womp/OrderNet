import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';

export function generateGroupKey(): Uint8Array {
  return randomBytes(32);
}

export function ed25519PrivToX25519(edPriv: Uint8Array): Uint8Array {
  return edwardsToMontgomeryPriv(edPriv);
}

export function ed25519PubToX25519(edPub: Uint8Array): Uint8Array {
  return edwardsToMontgomeryPub(edPub);
}

export function encryptGroupKeyForPeer(
  groupKey: Uint8Array,
  senderEdPriv: Uint8Array,
  recipientEdPub: Uint8Array
): { encryptedKey: Uint8Array; ephemeralPub: Uint8Array; nonce: Uint8Array } {
  // Generate ephemeral X25519 keypair
  const ephemeralPriv = randomBytes(32);
  const ephemeralPub = x25519.getPublicKey(ephemeralPriv);

  // Convert recipient's Ed25519 pubkey to X25519
  const recipientX25519Pub = ed25519PubToX25519(recipientEdPub);

  // ECDH with ephemeral private key and recipient's X25519 public key
  const sharedSecret = x25519.getSharedSecret(ephemeralPriv, recipientX25519Pub);

  // Derive encryption key via HKDF
  const derivedKey = hkdf(sha256, sharedSecret, undefined, 'ordernet-keyex', 32);

  // Encrypt the group key
  const nonce = randomBytes(24);
  const cipher = xchacha20poly1305(derivedKey, nonce);
  const encryptedKey = cipher.encrypt(groupKey);

  return { encryptedKey, ephemeralPub, nonce };
}

export function decryptGroupKeyFromPeer(
  encryptedKey: Uint8Array,
  recipientEdPriv: Uint8Array,
  ephemeralPub: Uint8Array,
  nonce: Uint8Array
): Uint8Array {
  // Convert recipient's Ed25519 private key to X25519
  const recipientX25519Priv = ed25519PrivToX25519(recipientEdPriv);

  // ECDH with recipient's X25519 private key and ephemeral public key
  const sharedSecret = x25519.getSharedSecret(recipientX25519Priv, ephemeralPub);

  // Derive decryption key via HKDF
  const derivedKey = hkdf(sha256, sharedSecret, undefined, 'ordernet-keyex', 32);

  // Decrypt the group key
  const cipher = xchacha20poly1305(derivedKey, nonce);
  return cipher.decrypt(encryptedKey);
}
