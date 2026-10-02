import { EditableReflectionSection, EditableTitle } from '@/components';
import {
  RecordOwnCaseButton,
  SampleBanner,
  SampleCaseGate,
  SamplePdpGoalCard,
} from '@/components/sample';
import { useTheme } from '@/theme';
import type { SampleCaseResponse } from '@acme/shared';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const noop = () => {};

/**
 * Read-only worked example of a finished entry, laid out like the real entry
 * screen (`(entry)/[artefactId].tsx`) with the same section and capability cards,
 * so it previews exactly what a trainee will get. Composes the shared cards with
 * `editable={false}` rather than reusing that Redux-bound, action-heavy screen.
 */
export default function SampleEntryScreen() {
  return <SampleCaseGate>{(sample) => <SampleEntry sample={sample} />}</SampleCaseGate>;
}

function SampleEntry({ sample }: { sample: SampleCaseResponse }) {
  const { colors } = useTheme();
  const router = useRouter();

  // Open the first section so the screen leads with real content, not a stack of
  // collapsed headings. Keys are sectionIds and capability codes.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(sample.sections.slice(0, 1).map((s) => s.sectionId))
  );
  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SampleBanner
          action={{
            label: 'View the conversation that produced this',
            onPress: () => router.push('/(sample)/conversation'),
          }}
        />

        <View style={styles.section}>
          <EditableTitle value={sample.title} onChange={noop} editable={false} />
          <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
            {sample.entryTypeLabel}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Entry</Text>
          {sample.sections.map((field) => (
            <EditableReflectionSection
              key={field.sectionId}
              section={{ title: field.label, text: field.text }}
              editable={false}
              expanded={expanded.has(field.sectionId)}
              onToggleExpand={() => toggle(field.sectionId)}
              onEdit={noop}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Capabilities</Text>
          {sample.capabilities.map((cap) => (
            <EditableReflectionSection
              key={cap.code}
              section={{ title: cap.name, text: cap.justification }}
              editable={false}
              expanded={expanded.has(cap.code)}
              onToggleExpand={() => toggle(cap.code)}
              onEdit={noop}
            />
          ))}
        </View>

        {sample.pdpGoals.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>PDP Goals</Text>
            <Text style={[styles.pdpHint, { color: colors.textSecondary }]}>
              When you finish an entry, you choose which suggested goals to track.
            </Text>
            {sample.pdpGoals.map((goal) => (
              <SamplePdpGoalCard key={goal.id} goal={goal} />
            ))}
          </View>
        )}
      </ScrollView>

      <RecordOwnCaseButton entryType={sample.entryType} />
    </View>
  );
}

// Section rhythm mirrors the real entry screen.
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 10,
  },
  metaLine: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  pdpHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: -2,
    marginBottom: 4,
  },
});
