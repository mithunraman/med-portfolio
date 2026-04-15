import { useTheme } from '@/theme';
import { useEffect, useReducer } from 'react';
import { StyleSheet, Text } from 'react-native';

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Updated just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Updated ${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `Updated ${diffDays}d ago`;
}

interface LastUpdatedLabelProps {
  timestamp: number | null;
}

export function LastUpdatedLabel({ timestamp }: LastUpdatedLabelProps) {
  const { colors } = useTheme();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (timestamp == null) return;
    const id = setInterval(forceUpdate, 60_000);
    return () => clearInterval(id);
  }, [timestamp]);

  if (timestamp == null) return null;

  return (
    <Text style={[styles.label, { color: colors.textSecondary }]}>
      {formatRelativeTime(timestamp)}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
  },
});
