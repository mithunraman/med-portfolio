import { useTheme } from '@/theme';
import { hexToRgba } from '@/utils/color';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const HOW_IT_WORKS = [
  { step: '1', text: 'Talk about your clinical experience' },
  { step: '2', text: 'We structure it into a portfolio entry' },
  { step: '3', text: 'Track your curriculum coverage over time' },
];

interface WelcomeModuleProps {
  specialtyLabel: string | null;
  stageLabel: string | null;
  onStartFirstEntry: () => void;
}

export function WelcomeModule({ specialtyLabel, stageLabel, onStartFirstEntry }: WelcomeModuleProps) {
  const { colors } = useTheme();
  const setupLine =
    specialtyLabel && stageLabel ? `You're set up for ${specialtyLabel}, ${stageLabel}.` : null;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Hero icon — visual anchor */}
      <View style={[styles.heroCircle, { backgroundColor: hexToRgba(colors.primary, 0.1) }]}>
        <Ionicons name="book-outline" size={32} color={colors.primary} />
      </View>

      <Text style={[styles.heading, { color: colors.text }]}>Here's how it works</Text>
      {setupLine && (
        <Text style={[styles.setupText, { color: colors.textSecondary }]}>{setupLine}</Text>
      )}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <View style={styles.steps}>
        {HOW_IT_WORKS.map((item) => (
          <View key={item.step} style={styles.stepRow}>
            <View
              style={[styles.stepCircle, { backgroundColor: hexToRgba(colors.primary, 0.12) }]}
            >
              <Text style={[styles.stepNumber, { color: colors.primary }]}>{item.step}</Text>
            </View>
            <Text style={[styles.stepText, { color: colors.text }]}>{item.text}</Text>
          </View>
        ))}
      </View>

      {/* CTA — direct action to eliminate cognitive gap */}
      <TouchableOpacity
        style={[styles.cta, { backgroundColor: colors.primary }]}
        onPress={onStartFirstEntry}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Record your first entry"
      >
        <Ionicons name="mic" size={18} color="#fff" />
        <Text style={styles.ctaText}>Record your first entry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    padding: 24,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 8,
  },
  heroCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heading: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  setupText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 12,
  },
  steps: {
    alignSelf: 'stretch',
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
