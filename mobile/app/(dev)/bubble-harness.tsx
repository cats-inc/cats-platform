import { Stack } from 'expo-router';
import { useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { MessageBody } from '../../src/renderer/MessageBody';
import { MessageBubble } from '../../src/renderer/MessageBubble';
import { sampleBubbles } from '../../src/renderer/sample-bubbles';
import { colors, spacing, typography } from '../../src/renderer/theme';

const HARNESS_CHANNEL_ID = 'harness-channel';

const FALLBACK_IMAGE = 'https://picsum.photos/seed/cats-bubble/240/180';

const FIXTURE_RESOLVER = (_channelId: string, filename: string) => {
  if (filename.endsWith('.png') || filename.endsWith('.jpg')) {
    return FALLBACK_IMAGE;
  }
  return `https://example.invalid/${encodeURIComponent(filename)}`;
};

const VIEWPORT_GATES = [320, 390, 768] as const;

export default function BubbleHarnessScreen() {
  const { width } = useWindowDimensions();
  const closestGate = useMemo(() => {
    return [...VIEWPORT_GATES].sort(
      (a, b) => Math.abs(a - width) - Math.abs(b - width),
    )[0];
  }, [width]);

  return (
    <>
      <Stack.Screen options={{ title: 'Bubble Harness' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.title}>MessageBody visual gate</Text>
          <Text style={styles.subtitle}>
            SPEC-095 NFR-002 / PLAN-084 Phase 2 — compare these RN bubbles to
            screenshots from the web renderer at 320 / 390 / 768 logical px.
          </Text>
          <View style={styles.viewportPill}>
            <Text style={styles.viewportPillText}>
              Current width: {Math.round(width)} px (closest gate: {closestGate})
            </Text>
          </View>
        </View>
        {sampleBubbles.map((sample) => (
          <View key={sample.id} style={styles.section}>
            <Text style={styles.sectionLabel}>{sample.description}</Text>
            <MessageBubble role={sample.role}>
              <MessageBody
                segments={sample.segments}
                attachments={sample.attachments}
                channelId={HARNESS_CHANNEL_ID}
                resolveAttachmentUrl={FIXTURE_RESOLVER}
              />
            </MessageBubble>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  scrollContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    gap: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    color: colors.fg.primary,
    ...typography.title,
  },
  subtitle: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  viewportPill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.status.warmBg,
  },
  viewportPillText: {
    color: colors.status.warmText,
    ...typography.label,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    paddingHorizontal: spacing.md,
    color: colors.fg.muted,
    ...typography.label,
  },
});
