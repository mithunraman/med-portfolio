import type { ComposedDocumentField } from '@acme/shared';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme';

interface Props {
  fields: ComposedDocumentField[];
}

/**
 * Read-only render of the composed entry document — the granular probes
 * projected into the FourteenFish-style fields the trainee submits.
 *
 * Intentionally not editable: the composed text is a deterministic projection
 * of the captured probe answers, so editing it here would desync from source.
 */
export const CompositeDocument = memo(function CompositeDocument({ fields }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {fields.map((field) => (
        <View key={field.sectionId}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{field.label}</Text>
          <Text style={[styles.text, { color: colors.text }]}>{field.text}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
});
