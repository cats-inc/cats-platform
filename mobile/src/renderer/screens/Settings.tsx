import { Link } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ownerFixture } from '../../api/fixtures/owner';
import {
  type ConnectionConfig,
  type ConnectionMode,
  loadConnectionConfig,
  resolveWebDashboardUrl,
  saveConnectionConfig,
} from '../../api/persistence';
import { colors, radii, spacing, typography } from '../theme';

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

export function Settings() {
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    mode: 'relay',
    baseUrl: null,
    pairingToken: null,
  });
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [approvalsOnly, setApprovalsOnly] = useState(false);

  useEffect(() => {
    let active = true;
    void loadConnectionConfig().then((loaded) => {
      if (!active) {
        return;
      }
      setConnectionConfig(loaded);
      setBaseUrlDraft(loaded.baseUrl ?? '');
    });
    return () => {
      active = false;
    };
  }, []);

  const updateConnection = (next: ConnectionConfig) => {
    setConnectionConfig(next);
    void saveConnectionConfig(next);
  };

  const handleSelectMode = (mode: ConnectionMode) => {
    updateConnection({ ...connectionConfig, mode });
  };

  const handleCommitBaseUrl = () => {
    const trimmed = baseUrlDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next === connectionConfig.baseUrl) {
      return;
    }
    updateConnection({ ...connectionConfig, baseUrl: next });
  };

  const webDashboardUrl = resolveWebDashboardUrl(connectionConfig);

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
            selected={connectionConfig.mode === option.id}
            onSelect={() => handleSelectMode(option.id)}
          />
        ))}
        <View style={styles.baseUrlRow}>
          <Text style={styles.baseUrlLabel}>Desktop base URL</Text>
          <TextInput
            value={baseUrlDraft}
            onChangeText={setBaseUrlDraft}
            onBlur={handleCommitBaseUrl}
            onSubmitEditing={handleCommitBaseUrl}
            placeholder="http://192.168.1.244:8181"
            placeholderTextColor={colors.fg.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.baseUrlInput}
          />
          <Text style={styles.baseUrlHint}>
            Where this device should reach your desktop cats. LAN, Tailscale,
            or tunnel URL — saved on blur.
          </Text>
        </View>
        {__DEV__ ? (
          <Text style={styles.scopeNote}>
            Phase-7 pairing flow will replace this manual URL entry. The
            persisted shape is forward-compatible: a `pairingToken` slot
            already exists in the config.
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
                ? 'Set a desktop base URL above to enable the web dashboard link.'
                : `Opens ${webDashboardUrl}`}
            </Text>
          </View>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        {__DEV__ ? (
          <Text style={styles.scopeNote}>
            Settings tab depth is locked per SPEC-095 — exactly the four
            sections above. Companion controls and Cats registry browse
            stay desktop-only.
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
  baseUrlRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  baseUrlLabel: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  baseUrlInput: {
    color: colors.fg.primary,
    ...typography.body,
    backgroundColor: colors.bg.panelSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  baseUrlHint: {
    color: colors.fg.muted,
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
