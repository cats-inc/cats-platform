import { Link } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ownerFixture } from '../../api/fixtures/owner';
import { colors, radii, spacing, typography } from '../theme';

type ConnectionMode = 'relay' | 'tunnel' | 'tailscale';

interface ConnectionOption {
  id: ConnectionMode;
  label: string;
  description: string;
}

const CONNECTION_OPTIONS: ConnectionOption[] = [
  {
    id: 'relay',
    label: 'Cloud relay (default)',
    description: 'Push notifications + low-bandwidth control via the cats relay.',
  },
  {
    id: 'tunnel',
    label: 'Tunnel / WebSocket relay',
    description: 'Direct interactive connection via Cloudflare Tunnel or self-hosted relay.',
  },
  {
    id: 'tailscale',
    label: 'Tailscale (power user)',
    description: 'Mesh VPN. Requires the Tailscale app and a configured tailnet.',
  },
];

/**
 * The web dashboard URL is not knowable until pairing produces a host
 * URL. `127.0.0.1` resolves to the device itself on mobile, not the
 * desktop, so we cannot fall back to the desktop's local URL. Until
 * pairing exists, the entry is rendered disabled.
 */
const PAIRED_WEB_DASHBOARD_URL: string | null = null;

export function Settings() {
  const [connection, setConnection] = useState<ConnectionMode>('relay');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [approvalsOnly, setApprovalsOnly] = useState(false);
  const webDashboardUrl = PAIRED_WEB_DASHBOARD_URL;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Mobile-relevant only. Use the desktop app for advanced controls.
        </Text>
      </View>

      <Section label="Connection mode">
        {CONNECTION_OPTIONS.map((option) => (
          <ConnectionRow
            key={option.id}
            option={option}
            selected={connection === option.id}
            onSelect={() => setConnection(option.id)}
          />
        ))}
        {__DEV__ ? (
          <Text style={styles.scopeNote}>
            Live pairing flow lands in PLAN-084 Phase 7. Selection here is
            local state only for now.
          </Text>
        ) : null}
      </Section>

      <Section label="Notifications">
        <ToggleRow
          label="Push notifications"
          description="Alerts when an approval, escalation, or task completion lands."
          value={notificationsEnabled}
          onValueChange={setNotificationsEnabled}
        />
        <ToggleRow
          label="Approvals only"
          description="Suppress task completion and informational pushes."
          value={approvalsOnly}
          onValueChange={setApprovalsOnly}
          disabled={!notificationsEnabled}
        />
      </Section>

      <Section label="Owner">
        <ReadOnlyRow label="Display name" value={ownerFixture.displayName} />
        <ReadOnlyRow label="Email" value={ownerFixture.email} />
      </Section>

      <Section label="Advanced">
        <Pressable
          accessibilityRole="link"
          accessibilityState={{ disabled: webDashboardUrl === null }}
          disabled={webDashboardUrl === null}
          onPress={() => {
            if (webDashboardUrl !== null) {
              void Linking.openURL(webDashboardUrl);
            }
          }}
          style={({ pressed }) => [
            styles.linkRow,
            webDashboardUrl === null ? styles.linkRowDisabled : null,
            pressed && webDashboardUrl !== null ? styles.linkRowPressed : null,
          ]}
        >
          <View style={styles.linkRowText}>
            <Text
              style={[
                styles.linkRowLabel,
                webDashboardUrl === null ? styles.linkRowLabelDisabled : null,
              ]}
            >
              Open web dashboard
            </Text>
            <Text style={styles.linkRowDescription}>
              {webDashboardUrl === null
                ? 'Pair this device with your desktop cats first to enable the web dashboard link.'
                : 'Cats registry editor, transport bindings, and other desktop-owned settings.'}
            </Text>
          </View>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        {__DEV__ ? (
          <Text style={styles.scopeNote}>
            Settings tab depth is an open SPEC-095 question. Companion
            controls and Cats registry read-only browse may land here
            pending owner decision.
          </Text>
        ) : null}
      </Section>

      {__DEV__ ? (
        <Section label="Developer tools">
          <Link href="/bubble-harness" style={styles.devLink}>
            Bubble visual gate
          </Link>
        </Section>
      ) : null}
    </ScrollView>
  );
}

interface SectionProps {
  label: string;
  children: ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

interface ConnectionRowProps {
  option: ConnectionOption;
  selected: boolean;
  onSelect: () => void;
}

function ConnectionRow({ option, selected, onSelect }: ConnectionRowProps) {
  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.connectionRow,
        pressed ? styles.connectionRowPressed : null,
      ]}
    >
      <View
        style={[
          styles.connectionRadio,
          selected ? styles.connectionRadioSelected : null,
        ]}
      >
        {selected ? <View style={styles.connectionRadioDot} /> : null}
      </View>
      <View style={styles.connectionRowText}>
        <Text style={styles.connectionLabel}>{option.label}</Text>
        <Text style={styles.connectionDescription}>{option.description}</Text>
      </View>
    </Pressable>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled,
}: ToggleRowProps) {
  return (
    <View style={[styles.toggleRow, disabled ? styles.rowDisabled : null]}>
      <View style={styles.toggleRowText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        thumbColor={value ? colors.accent.primary : colors.bg.panel}
        trackColor={{ false: colors.border.subtle, true: colors.accent.soft }}
      />
    </View>
  );
}

interface ReadOnlyRowProps {
  label: string;
  value: string;
}

function ReadOnlyRow({ label, value }: ReadOnlyRowProps) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.fg.primary,
    ...typography.display,
  },
  subtitle: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.8,
  },
  sectionBody: {
    backgroundColor: colors.bg.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  connectionRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  connectionRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  connectionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  connectionRadioSelected: {
    borderColor: colors.accent.primary,
  },
  connectionRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.primary,
  },
  connectionRowText: {
    flex: 1,
    gap: 2,
  },
  connectionLabel: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  connectionDescription: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  toggleRowText: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  toggleDescription: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  readOnlyLabel: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  readOnlyValue: {
    color: colors.fg.primary,
    ...typography.body,
    fontWeight: '500',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  linkRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  linkRowDisabled: {
    opacity: 0.55,
  },
  linkRowText: {
    flex: 1,
    gap: 2,
  },
  linkRowLabel: {
    color: colors.accent.primary,
    ...typography.bodyStrong,
  },
  linkRowLabelDisabled: {
    color: colors.fg.muted,
  },
  linkRowDescription: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  linkRowChevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
  scopeNote: {
    color: colors.fg.muted,
    ...typography.label,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  devLink: {
    color: colors.accent.primary,
    ...typography.body,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
