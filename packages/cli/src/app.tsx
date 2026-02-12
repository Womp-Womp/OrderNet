import React, { useState, useEffect, useCallback } from 'react';
import { Box, useApp } from 'ink';
import type { OrderNetNode, PlainMessage, OrderNetEvent } from '@ordernet/core';
import { ChannelList } from './components/channel-list.js';
import { ChatView } from './components/chat-view.js';
import { InputBar } from './components/input-bar.js';
import { MemberList } from './components/member-list.js';
import { StatusBar } from './components/status-bar.js';
import { isCommand, parseCommand } from './commands/parser.js';
import { handleCommand } from './commands/handlers.js';

type DisplayMessage = PlainMessage | { content: string; system: true; timestamp: number };

interface AppProps {
  node: OrderNetNode;
}

export function App({ node }: AppProps) {
  const { exit } = useApp();
  const [currentChannel, setCurrentChannel] = useState('');
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [messages, setMessages] = useState<Map<string, DisplayMessage[]>>(new Map());
  const [peerCount, setPeerCount] = useState(0);
  const [onlinePeers, setOnlinePeers] = useState<Map<string, { nickname: string; lastSeen: number }>>(new Map());

  const identity = node.getIdentity();

  const addSystemMessage = useCallback((content: string) => {
    setMessages(prev => {
      const next = new Map(prev);
      const channelMsgs = next.get(currentChannel) || [];
      next.set(currentChannel, [
        ...channelMsgs,
        { content, system: true as const, timestamp: Date.now() },
      ]);
      return next;
    });
  }, [currentChannel]);

  useEffect(() => {
    const handleEvent = (event: OrderNetEvent) => {
      switch (event.type) {
        case 'message':
          setMessages(prev => {
            const next = new Map(prev);
            const channelMsgs = next.get(event.message.channelId) || [];
            next.set(event.message.channelId, [...channelMsgs, event.message]);
            return next;
          });
          break;
        case 'peer-joined':
          setPeerCount(node.getPeerCount());
          setOnlinePeers(node.getOnlinePeers());
          break;
        case 'peer-left':
          setPeerCount(node.getPeerCount());
          setOnlinePeers(node.getOnlinePeers());
          break;
        case 'join-request':
          addSystemMessage(
            `Join request from ${Buffer.from(event.request.requesterPubKey).toString('hex').slice(0, 8)}.. for #${event.request.channelId}`
          );
          break;
        case 'vouch-received':
          addSystemMessage(
            `Vouch received for #${event.vouch.channelId}`
          );
          break;
        case 'key-received':
          addSystemMessage(`Received key for #${event.channelId}`);
          setChannels(node.getChannels());
          break;
      }
    };

    node.on('event', handleEvent);
    return () => { node.off('event', handleEvent); };
  }, [node, addSystemMessage]);

  // Refresh channels periodically
  useEffect(() => {
    setChannels(node.getChannels());
    const interval = setInterval(() => {
      setChannels(node.getChannels());
      setPeerCount(node.getPeerCount());
      setOnlinePeers(node.getOnlinePeers());
    }, 5000);
    return () => clearInterval(interval);
  }, [node]);

  const handleInput = async (input: string) => {
    if (isCommand(input)) {
      const cmd = parseCommand(input);
      if (!cmd) return;

      if (cmd.command === 'quit' || cmd.command === 'exit') {
        await node.stop();
        exit();
        return;
      }

      const result = await handleCommand(cmd, {
        node,
        currentChannel,
        setCurrentChannel: (ch: string) => {
          setCurrentChannel(ch);
          setChannels(node.getChannels());
        },
        addSystemMessage,
      });

      addSystemMessage(result.output);
    } else {
      if (!currentChannel) {
        addSystemMessage('No channel selected. Use /join #channel first.');
        return;
      }
      const plain = await node.sendMessage(currentChannel, input);
      if (plain) {
        setMessages(prev => {
          const next = new Map(prev);
          const channelMsgs = next.get(currentChannel) || [];
          next.set(currentChannel, [...channelMsgs, plain]);
          return next;
        });
      }
    }
  };

  const currentChannelName = channels.find(c => c.id === currentChannel)?.name || '';
  const currentMessages = messages.get(currentChannel) || [];

  // Build member list from online peers + self
  const members: Array<{ pubKey: string; nickname: string; isMe: boolean }> = [
    { pubKey: identity.pubKeyHex, nickname: identity.nickname, isMe: true },
  ];
  for (const [key, info] of onlinePeers) {
    members.push({ pubKey: key, nickname: info.nickname, isMe: false });
  }

  return (
    <Box flexDirection="column" height={process.stdout.rows || 24}>
      <Box flexGrow={1}>
        <ChannelList channels={channels} currentChannel={currentChannel} />
        <Box flexDirection="column" flexGrow={1}>
          <ChatView channelName={currentChannelName} messages={currentMessages} />
          <InputBar onSubmit={handleInput} channelName={currentChannelName} />
        </Box>
        <MemberList members={members} />
      </Box>
      <StatusBar
        peerCount={peerCount}
        fingerprint={identity.fingerprint}
        nickname={identity.nickname}
      />
    </Box>
  );
}
