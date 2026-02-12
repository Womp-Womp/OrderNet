import React from 'react';
import { Box, Text } from 'ink';

interface ChannelListProps {
  channels: Array<{ id: string; name: string }>;
  currentChannel: string;
}

export function ChannelList({ channels, currentChannel }: ChannelListProps) {
  return (
    <Box flexDirection="column" width={16} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="white">Channels</Text>
      <Text color="gray">{'─'.repeat(12)}</Text>
      {channels.length === 0 && (
        <Text color="gray" dimColor>no channels</Text>
      )}
      {channels.map(ch => (
        <Text
          key={ch.id}
          color={ch.id === currentChannel ? 'cyan' : 'white'}
          bold={ch.id === currentChannel}
        >
          {ch.id === currentChannel ? '> ' : '  '}{ch.name}
        </Text>
      ))}
    </Box>
  );
}
