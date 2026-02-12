import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputBarProps {
  onSubmit: (value: string) => void;
  channelName: string;
}

export function InputBar({ onSubmit, channelName }: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (val: string) => {
    if (val.trim()) {
      onSubmit(val.trim());
    }
    setValue('');
  };

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="cyan">{channelName ? `${channelName}> ` : '> '}</Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
}
