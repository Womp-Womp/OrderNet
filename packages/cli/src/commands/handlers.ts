import type { OrderNetNode } from '@ordernet/core';
import { hexToPubKey, getFingerprint } from '@ordernet/core';
import type { ParsedCommand } from './parser.js';

export interface CommandResult {
  output: string;
  error?: boolean;
}

export type CommandContext = {
  node: OrderNetNode;
  currentChannel: string;
  setCurrentChannel: (ch: string) => void;
  addSystemMessage: (msg: string) => void;
};

export async function handleCommand(
  cmd: ParsedCommand,
  ctx: CommandContext
): Promise<CommandResult> {
  switch (cmd.command) {
    case 'join':
    case 'create':
    case 'public':
      return handleJoin(cmd, ctx);
    case 'private':
      return handlePrivate(cmd, ctx);
    case 'leave':
      return handleLeave(cmd, ctx);
    case 'nick':
      return handleNick(cmd, ctx);
    case 'vouch':
      return handleVouch(cmd, ctx);
    case 'members':
      return handleMembers(ctx);
    case 'trust':
      return handleTrust(ctx);
    case 'invite':
      return handleInvite(ctx);
    case 'invitepeer':
      return handleInvitePeer(cmd, ctx);
    case 'invitecode':
      return handleInviteCode(cmd, ctx);
    case 'accept':
      return handleAcceptInvite(cmd, ctx);
    case 'channels':
      return handleChannels(ctx);
    case 'dm':
      return handleDm(cmd, ctx);
    case 'peers':
      return handlePeers(ctx);
    case 'help':
      return handleHelp();
    case 'quit':
    case 'exit':
      return { output: 'Shutting down...' };
    default:
      return { output: `Unknown command: /${cmd.command}. Type /help for commands.`, error: true };
  }
}

function handleJoin(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const name = cmd.args[0];
  if (!name) return { output: 'Usage: /join #channel', error: true };

  const channelName = name.startsWith('#') ? name : `#${name}`;
  const channelId = channelName.slice(1);

  ctx.node.createChannel(channelId);
  ctx.setCurrentChannel(channelId);
  return { output: `Joined ${channelName}` };
}

function handlePrivate(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const name = cmd.args[0];
  if (!name) return { output: 'Usage: /private #group <pubkey1,pubkey2,...>', error: true };
  const channelName = name.startsWith('#') ? name : `#${name}`;
  const channelId = channelName.slice(1);
  const membersArg = cmd.args[1] || '';
  const members = membersArg
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  ctx.node.createPrivateChannel(channelId, members, 1);
  ctx.setCurrentChannel(channelId);
  return { output: `Created private group ${channelName} (invite-only)` };
}

function handleLeave(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const name = cmd.args[0] || ctx.currentChannel;
  if (!name) return { output: 'Usage: /leave #channel', error: true };

  const channelId = name.startsWith('#') ? name.slice(1) : name;
  ctx.node.leaveChannel(channelId);

  if (ctx.currentChannel === channelId) {
    const channels = ctx.node.getChannels();
    ctx.setCurrentChannel(channels[0]?.id ?? '');
  }

  return { output: `Left #${channelId}` };
}

function handleNick(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const nick = cmd.args[0];
  if (!nick) return { output: 'Usage: /nick <name>', error: true };

  ctx.node.setNickname(nick);
  return { output: `Nickname changed to ${nick}` };
}

async function handleVouch(cmd: ParsedCommand, ctx: CommandContext): Promise<CommandResult> {
  const fingerprint = cmd.args[0];
  if (!fingerprint) return { output: 'Usage: /vouch <pubkey-hex>', error: true };

  try {
    const pubKey = hexToPubKey(fingerprint);
    await ctx.node.vouchForPeer(pubKey, ctx.currentChannel);
    return { output: `Vouched for ${getFingerprint(pubKey)} in #${ctx.currentChannel}` };
  } catch (err) {
    return { output: `Failed to vouch: ${err}`, error: true };
  }
}

function handleMembers(ctx: CommandContext): CommandResult {
  const members = ctx.node.getChannelMembers(ctx.currentChannel);
  if (members.length === 0) return { output: 'No members in current channel' };
  const list = members.map(m => `  ${m.slice(0, 8)}..${m.slice(-4)}`).join('\n');
  return { output: `Members of #${ctx.currentChannel}:\n${list}` };
}

function handleTrust(ctx: CommandContext): CommandResult {
  const graph = ctx.node.getTrustGraph(ctx.currentChannel);
  if (graph.length === 0) return { output: 'No vouches in current channel' };
  const lines = graph.map(
    g => `  ${g.voucher.slice(0, 8)}.. vouched for ${g.vouchee.slice(0, 8)}..`
  );
  return { output: `Trust graph for #${ctx.currentChannel}:\n${lines.join('\n')}` };
}

function handleInvite(ctx: CommandContext): CommandResult {
  const info = ctx.node.getIdentity();
  return {
    output: `Your identity:\n  Fingerprint: ${info.fingerprint}\n  Public key: ${info.pubKeyHex}\n  Share this with peers so they can vouch for you.`,
  };
}

function handleInvitePeer(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const peer = (cmd.args[0] || '').toLowerCase();
  const target = cmd.args[1] || ctx.currentChannel;
  if (!peer) return { output: 'Usage: /invitepeer <pubkey-hex> [#channel]', error: true };
  if (!target) return { output: 'No channel selected', error: true };
  const channelId = target.startsWith('#') ? target.slice(1) : target;
  const ok = ctx.node.inviteToChannel(channelId, peer);
  if (!ok) return { output: `Failed to invite peer to #${channelId}`, error: true };
  return { output: `Invited ${peer.slice(0, 12)}.. to #${channelId}` };
}

function handleInviteCode(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const target = cmd.args[0] || ctx.currentChannel;
  if (!target) return { output: 'Usage: /invitecode [#channel]', error: true };
  const channelId = target.startsWith('#') ? target.slice(1) : target;
  const code = ctx.node.createInviteCode(channelId);
  if (!code) return { output: `Failed to generate invite for #${channelId}`, error: true };
  return { output: `Invite code for #${channelId}:\n${code}` };
}

function handleAcceptInvite(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const code = cmd.args[0];
  if (!code) return { output: 'Usage: /accept <invite-code>', error: true };
  const channelId = ctx.node.joinWithInviteCode(code);
  if (!channelId) return { output: 'Invalid invite code', error: true };
  ctx.setCurrentChannel(channelId);
  return { output: `Joined #${channelId} via invite code` };
}

function handleChannels(ctx: CommandContext): CommandResult {
  const channels = ctx.node.getChannels();
  if (channels.length === 0) return { output: 'No channels. Use /join #name to create one.' };
  const list = channels.map(ch => `  ${ch.name}${ch.id === ctx.currentChannel ? ' (active)' : ''}`);
  return { output: `Channels:\n${list.join('\n')}` };
}

function handleDm(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const target = (cmd.args[0] || '').toLowerCase();
  if (!target) return { output: 'Usage: /dm <peer-pubkey-hex>', error: true };
  const channelId = ctx.node.createDmChannel(target);
  ctx.setCurrentChannel(channelId);
  return { output: `Opened DM channel ${channelId}` };
}

function handlePeers(ctx: CommandContext): CommandResult {
  const peers = ctx.node.getOnlinePeers();
  if (peers.size === 0) return { output: 'No peers online' };
  const lines: string[] = [];
  for (const [key, info] of peers) {
    lines.push(`  ${info.nickname} (${key.slice(0, 8)}..${key.slice(-4)})`);
  }
  return { output: `Online peers:\n${lines.join('\n')}` };
}

function handleHelp(): CommandResult {
  return {
    output: `Commands:
  /join #channel    - Join or create a public channel
  /create #channel  - Alias for /join
  /public #channel  - Alias for /join
  /private #ch ids  - Create invite-only private group
  /invite           - Show your identity for sharing
  /invitepeer <id> [#channel] - Add a peer to channel allowlist
  /invitecode [#channel] - Generate manual invite code
  /accept <code>    - Join via invite code
  /leave [#channel] - Leave a channel
  /nick <name>      - Change nickname
  /vouch <pubkey>   - Vouch for a peer
  /members          - List channel members
  /trust            - Show trust graph
  /channels         - List your channels
  /peers            - List online peers
  /dm <pubkey>      - Open/create direct message channel
  /help             - Show this help
  /quit             - Exit OrderNet`,
  };
}
