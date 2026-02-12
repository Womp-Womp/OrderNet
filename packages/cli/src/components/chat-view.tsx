import React from 'react';
import { Box, Text } from 'ink';
import type { PlainMessage } from '@ordernet/core';

interface ChatViewProps {
  channelName: string;
  messages: Array<PlainMessage | { content: string; system: true; timestamp: number }>;
}

export function ChatView({ channelName, messages }: ChatViewProps) {
  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="cyan">{channelName || 'No channel selected'}</Text>
      <Text color="gray">{'─'.repeat(40)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        {messages.length === 0 && (
          <Text color="gray" dimColor>No messages yet. Start chatting!</Text>
        )}
        {messages.slice(-50).map((msg, i) => {
          if ('system' in msg) {
            return (
              <Text key={i} color="yellow">* {msg.content}</Text>
            );
          }
          const time = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <Text key={i}>
              <Text color="gray">[{time}] </Text>
              <Text color="green">&lt;{msg.senderNick}&gt; </Text>
              <Text>{msg.content}</Text>
            </Text>
          );
        })}
      </Box>
    </Box>
  );
}
