import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase } from '../storage/db.js';
import { WebOfTrust } from '../trust/web-of-trust.js';
import { generateIdentity } from '../crypto/identity.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

describe('WebOfTrust', () => {
  it('should create and verify vouches', async () => {
    const wot = new WebOfTrust(db);
    const voucher = await generateIdentity('alice');
    const vouchee = await generateIdentity('bob');

    const vouch = await wot.createVouch(
      voucher.privateKey,
      voucher.publicKey,
      vouchee.publicKey,
      'general'
    );

    const valid = await wot.verifyVouch(vouch);
    expect(valid).toBe(true);
  });

  it('should track vouch counts', async () => {
    const wot = new WebOfTrust(db);
    const alice = await generateIdentity('alice');
    const bob = await generateIdentity('bob');
    const charlie = await generateIdentity('charlie');
    const newUser = await generateIdentity('newuser');

    // Create join request
    wot.createJoinRequest(newUser.publicKey, 'general');

    // Alice vouches
    await wot.createVouch(
      alice.privateKey,
      alice.publicKey,
      newUser.publicKey,
      'general'
    );
    expect(wot.getVouchCount(newUser.publicKey, 'general')).toBe(1);

    // Bob vouches
    await wot.createVouch(
      bob.privateKey,
      bob.publicKey,
      newUser.publicKey,
      'general'
    );
    expect(wot.getVouchCount(newUser.publicKey, 'general')).toBe(2);

    // Charlie vouches
    await wot.createVouch(
      charlie.privateKey,
      charlie.publicKey,
      newUser.publicKey,
      'general'
    );
    expect(wot.getVouchCount(newUser.publicKey, 'general')).toBe(3);
  });

  it('should not double-count vouches', async () => {
    const wot = new WebOfTrust(db);
    const alice = await generateIdentity('alice');
    const newUser = await generateIdentity('newuser');

    wot.createJoinRequest(newUser.publicKey, 'general');

    await wot.createVouch(
      alice.privateKey,
      alice.publicKey,
      newUser.publicKey,
      'general'
    );

    // Try vouching again
    await wot.createVouch(
      alice.privateKey,
      alice.publicKey,
      newUser.publicKey,
      'general'
    );

    expect(wot.getVouchCount(newUser.publicKey, 'general')).toBe(1);
  });

  it('should check if vouched', async () => {
    const wot = new WebOfTrust(db);
    const alice = await generateIdentity('alice');
    const bob = await generateIdentity('bob');
    const newUser = await generateIdentity('newuser');

    await wot.createVouch(
      alice.privateKey,
      alice.publicKey,
      newUser.publicKey,
      'general'
    );

    expect(wot.hasVouched(alice.publicKey, newUser.publicKey, 'general')).toBe(true);
    expect(wot.hasVouched(bob.publicKey, newUser.publicKey, 'general')).toBe(false);
  });

  it('should manage join requests', async () => {
    const wot = new WebOfTrust(db);
    const newUser = await generateIdentity('newuser');

    wot.createJoinRequest(newUser.publicKey, 'general');

    const req = wot.getJoinRequest(newUser.publicKey, 'general');
    expect(req).not.toBeNull();
    expect(req!.status).toBe('pending');

    const pending = wot.getPendingRequests('general');
    expect(pending).toHaveLength(1);

    wot.approveRequest(newUser.publicKey, 'general');
    const approved = wot.getJoinRequest(newUser.publicKey, 'general');
    expect(approved!.status).toBe('approved');

    const pendingAfter = wot.getPendingRequests('general');
    expect(pendingAfter).toHaveLength(0);
  });

  it('should return trust graph', async () => {
    const wot = new WebOfTrust(db);
    const alice = await generateIdentity('alice');
    const bob = await generateIdentity('bob');
    const newUser = await generateIdentity('newuser');

    await wot.createVouch(
      alice.privateKey,
      alice.publicKey,
      newUser.publicKey,
      'general'
    );

    await wot.createVouch(
      bob.privateKey,
      bob.publicKey,
      newUser.publicKey,
      'general'
    );

    const graph = wot.getTrustGraph('general');
    expect(graph).toHaveLength(2);
  });
});
