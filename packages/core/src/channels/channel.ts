import { pubKeyToHex } from '../crypto/identity.js';
import type { ChannelConfig, ChannelState } from '../types.js';

export function createChannelState(
  config: ChannelConfig,
  groupKey: Uint8Array,
  initialMembers: Uint8Array[] = []
): ChannelState {
  const members = new Set<string>();
  members.add(pubKeyToHex(config.creatorPubKey));
  for (const m of initialMembers) {
    members.add(pubKeyToHex(m));
  }
  return { config, groupKey, members };
}

export function addMember(state: ChannelState, pubKey: Uint8Array): void {
  state.members.add(pubKeyToHex(pubKey));
}

export function removeMember(state: ChannelState, pubKey: Uint8Array): void {
  state.members.delete(pubKeyToHex(pubKey));
}

export function isMember(state: ChannelState, pubKey: Uint8Array): boolean {
  return state.members.has(pubKeyToHex(pubKey));
}

export function isCreator(state: ChannelState, pubKey: Uint8Array): boolean {
  return pubKeyToHex(state.config.creatorPubKey) === pubKeyToHex(pubKey);
}
