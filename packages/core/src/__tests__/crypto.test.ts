import { describe, it, expect } from 'vitest';
import {
  generateIdentity,
  signMessage,
  verifySignature,
  getFingerprint,
  pubKeyToHex,
  hexToPubKey,
  encryptPrivateKey,
  decryptPrivateKey,
} from '../crypto/identity.js';
import {
  generateGroupKey,
  encryptGroupKeyForPeer,
  decryptGroupKeyFromPeer,
} from '../crypto/group-keys.js';
import {
  encryptMessage,
  decryptMessage,
  serializeEncryptedMessage,
  deserializeEncryptedMessage,
} from '../crypto/messages.js';

describe('Identity', () => {
  it('should generate a valid identity', async () => {
    const id = await generateIdentity('alice');
    expect(id.publicKey).toHaveLength(32);
    expect(id.privateKey).toHaveLength(32);
    expect(id.nickname).toBe('alice');
  });

  it('should sign and verify messages', async () => {
    const id = await generateIdentity('alice');
    const msg = new TextEncoder().encode('hello world');
    const sig = await signMessage(id.privateKey, msg);
    const valid = await verifySignature(id.publicKey, msg, sig);
    expect(valid).toBe(true);
  });

  it('should reject invalid signatures', async () => {
    const id1 = await generateIdentity('alice');
    const id2 = await generateIdentity('bob');
    const msg = new TextEncoder().encode('hello world');
    const sig = await signMessage(id1.privateKey, msg);
    const valid = await verifySignature(id2.publicKey, msg, sig);
    expect(valid).toBe(false);
  });

  it('should generate fingerprints', async () => {
    const id = await generateIdentity('alice');
    const fp = getFingerprint(id.publicKey);
    expect(fp).toMatch(/^[0-9a-f]{8}\.\.[0-9a-f]{4}$/);
  });

  it('should convert pubkey to/from hex', async () => {
    const id = await generateIdentity('alice');
    const hex = pubKeyToHex(id.publicKey);
    const back = hexToPubKey(hex);
    expect(back).toEqual(id.publicKey);
  });

  it('should encrypt and decrypt private keys', async () => {
    const id = await generateIdentity('alice');
    const passphrase = 'test-passphrase';
    const { encrypted, salt, nonce } = encryptPrivateKey(id.privateKey, passphrase);
    const decrypted = decryptPrivateKey(encrypted, passphrase, salt, nonce);
    expect(decrypted).toEqual(id.privateKey);
  });
});

describe('Group Keys', () => {
  it('should generate a 32-byte group key', () => {
    const key = generateGroupKey();
    expect(key).toHaveLength(32);
  });

  it('should encrypt and decrypt group key for peer', async () => {
    const sender = await generateIdentity('alice');
    const recipient = await generateIdentity('bob');
    const groupKey = generateGroupKey();

    const { encryptedKey, ephemeralPub, nonce } = encryptGroupKeyForPeer(
      groupKey,
      sender.privateKey,
      recipient.publicKey
    );

    const decrypted = decryptGroupKeyFromPeer(
      encryptedKey,
      recipient.privateKey,
      ephemeralPub,
      nonce
    );

    expect(decrypted).toEqual(groupKey);
  });
});

describe('Message Encryption', () => {
  it('should encrypt and decrypt messages', async () => {
    const id = await generateIdentity('alice');
    const groupKey = generateGroupKey();

    const encrypted = await encryptMessage(
      'hello world',
      'general',
      groupKey,
      id.publicKey,
      id.privateKey,
      'alice'
    );

    expect(encrypted.channelId).toBe('general');
    expect(encrypted.nonce).toHaveLength(24);

    const plain = await decryptMessage(encrypted, groupKey);
    expect(plain).not.toBeNull();
    expect(plain!.content).toBe('hello world');
    expect(plain!.senderNick).toBe('alice');
    expect(plain!.channelId).toBe('general');
  });

  it('should fail to decrypt with wrong group key', async () => {
    const id = await generateIdentity('alice');
    const groupKey = generateGroupKey();
    const wrongKey = generateGroupKey();

    const encrypted = await encryptMessage(
      'secret',
      'general',
      groupKey,
      id.publicKey,
      id.privateKey,
      'alice'
    );

    const plain = await decryptMessage(encrypted, wrongKey);
    expect(plain).toBeNull();
  });

  it('should serialize and deserialize encrypted messages', async () => {
    const id = await generateIdentity('alice');
    const groupKey = generateGroupKey();

    const encrypted = await encryptMessage(
      'hello',
      'general',
      groupKey,
      id.publicKey,
      id.privateKey,
      'alice'
    );

    const serialized = serializeEncryptedMessage(encrypted);
    const deserialized = deserializeEncryptedMessage(serialized);

    expect(deserialized.channelId).toBe(encrypted.channelId);
    expect(deserialized.messageId).toBe(encrypted.messageId);
    expect(deserialized.nonce).toEqual(encrypted.nonce);
    expect(deserialized.ciphertext).toEqual(encrypted.ciphertext);

    // Verify deserialized message can be decrypted
    const plain = await decryptMessage(deserialized, groupKey);
    expect(plain).not.toBeNull();
    expect(plain!.content).toBe('hello');
  });
});
