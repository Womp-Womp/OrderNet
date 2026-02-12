import { generateGroupKey } from '../crypto/group-keys.js';
import { pubKeyToHex } from '../crypto/identity.js';
import { createChannelState, addMember } from './channel.js';
import type { ChannelStore } from '../storage/channels.js';
import type { ChannelConfig, ChannelState, Identity } from '../types.js';

export class ChannelManager {
  private channels = new Map<string, ChannelState>();

  constructor(
    private channelStore: ChannelStore,
    private identity: Identity
  ) {
    this.loadChannels();
  }

  private loadChannels(): void {
    const stored = this.channelStore.getAll();
    for (const s of stored) {
      const state = createChannelState(s.config, s.groupKey);
      state.members.add(pubKeyToHex(this.identity.publicKey));
      this.channels.set(s.config.id, state);
    }
  }

  createChannel(name: string, vouchThreshold = 2): ChannelState {
    const id = name.startsWith('#') ? name.slice(1) : name;
    const displayName = name.startsWith('#') ? name : `#${name}`;

    if (this.channels.has(id)) {
      return this.channels.get(id)!;
    }

    const groupKey = generateGroupKey();
    const config: ChannelConfig = {
      id,
      name: displayName,
      creatorPubKey: this.identity.publicKey,
      vouchThreshold,
      createdAt: Date.now(),
    };

    const state = createChannelState(config, groupKey);
    this.channels.set(id, state);

    this.channelStore.save({
      config,
      groupKey,
      joinedAt: Date.now(),
    });

    return state;
  }

  joinChannel(config: ChannelConfig, groupKey: Uint8Array): ChannelState {
    const state = createChannelState(config, groupKey);
    addMember(state, this.identity.publicKey);
    this.channels.set(config.id, state);

    this.channelStore.save({
      config,
      groupKey,
      joinedAt: Date.now(),
    });

    return state;
  }

  leaveChannel(channelId: string): void {
    this.channels.delete(channelId);
    this.channelStore.delete(channelId);
  }

  getChannel(channelId: string): ChannelState | undefined {
    return this.channels.get(channelId);
  }

  getAllChannels(): ChannelState[] {
    return Array.from(this.channels.values());
  }

  getChannelIds(): string[] {
    return Array.from(this.channels.keys());
  }

  hasChannel(channelId: string): boolean {
    return this.channels.has(channelId);
  }

  updateGroupKey(channelId: string, newKey: Uint8Array): void {
    const state = this.channels.get(channelId);
    if (state) {
      state.groupKey = newKey;
      this.channelStore.updateGroupKey(channelId, newKey);
    }
  }

  addMemberToChannel(channelId: string, pubKey: Uint8Array): void {
    const state = this.channels.get(channelId);
    if (state) {
      addMember(state, pubKey);
    }
  }
}
