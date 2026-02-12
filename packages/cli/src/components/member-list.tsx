import React from 'react';
import { Box, Text } from 'ink';

interface MemberListProps {
  members: Array<{ pubKey: string; nickname: string; isMe: boolean }>;
}

export function MemberList({ members }: MemberListProps) {
  return (
    <Box flexDirection="column" width={16} borderStyle="single" borderColor="gray" paddingX={1}>
      <Text bold color="white">Users</Text>
      <Text color="gray">{'─'.repeat(12)}</Text>
      {members.length === 0 && (
        <Text color="gray" dimColor>no users</Text>
      )}
      {members.map(m => (
        <Text key={m.pubKey} color={m.isMe ? 'green' : 'white'}>
          {m.isMe ? '* ' : '  '}{m.nickname}
        </Text>
      ))}
    </Box>
  );
}
