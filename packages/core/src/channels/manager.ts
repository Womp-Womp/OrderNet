import { generateGroupKey } from '../crypto/group-keys.js';
import { pubKeyToHex } from '../crypto/identity.js';
import { createChannelState, addMember } from './channel.js';
import type { ChannelStore } from '../storage/channels.js';
import type { ChannelAccessMode, ChannelConfig, ChannelState, Identity } from '../types.js';

interface ChannelOptions {
  accessMode?: ChannelAccessMode;
  inviteOnly?: boolean;
  allowedMembers?: string[];
}

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
      const config = this.normalizeConfig(s.config);
      const state = createChannelState(config, s.groupKey);
      state.members.add(pubKeyToHex(this.identity.publicKey));
      this.channels.set(s.config.id, state);
    }
  }

  createChannel(name: string, vouchThreshold = 2, options: ChannelOptions = {}): ChannelState {
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
      accessMode: options.accessMode ?? 'public',
      inviteOnly: options.inviteOnly ?? false,
      allowedMembers: this.normalizeAllowedMembers(options.allowedMembers),
    };

    const state = createChannelState(this.normalizeConfig(config), groupKey);
    this.channels.set(id, state);

    this.channelStore.save({
      config,
      groupKey,
      joinedAt: Date.now(),
    });

    return state;
  }

  createPrivateChannel(name: string, allowedMemberHexes: string[] = [], vouchThreshold = 1): ChannelState {
    return this.createChannel(name, vouchThreshold, {
      accessMode: 'private',
      inviteOnly: true,
      allowedMembers: allowedMemberHexes,
    });
  }

  createDmChannel(peerPubKeyHex: string): ChannelState {
    const selfHex = pubKeyToHex(this.identity.publicKey);
    const [a, b] = [selfHex, peerPubKeyHex.toLowerCase()].sort();
    const channelId = `dm-${a.slice(0, 16)}-${b.slice(0, 16)}`;
    return this.createChannel(channelId, 1, {
      accessMode: 'dm',
      inviteOnly: true,
      allowedMembers: [peerPubKeyHex],
    });
  }

  joinChannel(config: ChannelConfig, groupKey: Uint8Array): ChannelState {
    const state = createChannelState(this.normalizeConfig(config), groupKey);
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

  inviteMember(channelId: string, memberPubKeyHex: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;
    // Public channels should stay public when sharing peer identities.
    if ((state.config.accessMode ?? 'public') === 'public' && !state.config.inviteOnly) {
      return true;
    }
    const normalized = memberPubKeyHex.toLowerCase();
    const allowed = new Set(state.config.allowedMembers ?? []);
    allowed.add(normalized);
    state.config.allowedMembers = Array.from(allowed);
    state.config.inviteOnly = true;
    this.channelStore.save({
      config: state.config,
      groupKey: state.groupKey,
      joinedAt: state.config.createdAt,
    });
    return true;
  }

  hasAccess(channelId: string, memberPubKeyHex: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;
    if (!state.config.inviteOnly) return true;
    const allowed = new Set((state.config.allowedMembers ?? []).map((v) => v.toLowerCase()));
    return allowed.has(memberPubKeyHex.toLowerCase());
  }

  getAccess(channelId: string): { accessMode: ChannelAccessMode; inviteOnly: boolean; allowedMembers: string[] } | null {
    const state = this.channels.get(channelId);
    if (!state) return null;
    return {
      accessMode: state.config.accessMode ?? 'public',
      inviteOnly: !!state.config.inviteOnly,
      allowedMembers: state.config.allowedMembers ?? [],
    };
  }

  private normalizeConfig(config: ChannelConfig): ChannelConfig {
    return {
      ...config,
      accessMode: config.accessMode ?? 'public',
      inviteOnly: config.inviteOnly ?? false,
      allowedMembers: this.normalizeAllowedMembers(config.allowedMembers),
    };
  }

  private normalizeAllowedMembers(allowedMembers: string[] | undefined): string[] {
    const values = new Set<string>();
    values.add(pubKeyToHex(this.identity.publicKey).toLowerCase());
    for (const member of allowedMembers ?? []) {
      if (member && typeof member === 'string') {
        values.add(member.toLowerCase());
      }
    }
    return Array.from(values);
  }
}
