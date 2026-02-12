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
      return handleJoin(cmd, ctx);
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

function handleChannels(ctx: CommandContext): CommandResult {
  const channels = ctx.node.getChannels();
  if (channels.length === 0) return { output: 'No channels. Use /join #name to create one.' };
  const list = channels.map(ch => `  ${ch.name}${ch.id === ctx.currentChannel ? ' (active)' : ''}`);
  return { output: `Channels:\n${list.join('\n')}` };
}

function handleDm(cmd: ParsedCommand, ctx: CommandContext): CommandResult {
  const target = cmd.args[0];
  const message = cmd.args.slice(1).join(' ');
  if (!target || !message) return { output: 'Usage: /dm <fingerprint> <message>', error: true };
  return { output: 'DM support coming soon (Phase 6)' };
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
  /join #channel    - Join or create a channel
  /leave [#channel] - Leave a channel
  /nick <name>      - Change nickname
  /vouch <pubkey>   - Vouch for a peer
  /members          - List channel members
  /trust            - Show trust graph
  /invite           - Show your identity for sharing
  /channels         - List your channels
  /peers            - List online peers
  /dm <id> <msg>    - Direct message (coming soon)
  /help             - Show this help
  /quit             - Exit OrderNet`,
  };
}
