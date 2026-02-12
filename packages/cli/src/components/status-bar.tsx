import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  peerCount: number;
  fingerprint: string;
  nickname: string;
}

export function StatusBar({ peerCount, fingerprint, nickname }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan">[{nickname}]</Text>
      <Text> </Text>
      <Text color="green">[peers: {peerCount}]</Text>
      <Text> </Text>
      <Text color="yellow">[{fingerprint}]</Text>
    </Box>
  );
}
