import { useSampleCase } from '@/hooks';
import { useTheme } from '@/theme';
import type { SampleCaseResponse } from '@acme/shared';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { EmptyState } from '../EmptyState';

interface SampleCaseGateProps {
  children: (sample: SampleCaseResponse) => ReactNode;
}

/** Shared loading / error handling for the sample screens; renders children once loaded. */
export function SampleCaseGate({ children }: SampleCaseGateProps) {
  const { colors } = useTheme();
  const state = useSampleCase();

  if (state.status === 'ready') return <>{children(state.sample)}</>;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {state.status === 'loading' ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load the sample"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={state.retry}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
