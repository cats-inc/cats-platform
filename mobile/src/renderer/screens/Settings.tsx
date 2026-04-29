import { type ReactNode, useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createMobileApiClient } from '../../api/client';
import {
  type ConnectionConfig,
  type NotificationPreferences,
  loadConnectionConfig,
  loadNotificationPreferences,
  resolveWebDashboardUrl,
  saveConnectionConfig,
  saveNotificationPreferences,
} from '../../api/persistence';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import { colors, radii, spacing, typography } from '../theme';

export function Settings() {
  const [connectionConfig, setConnectionConfig] = useState<ConnectionConfig>({
    baseUrl: null,
  });
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [notificationPrefs, setNotificationPrefs] =
    useState<NotificationPreferences>({
      enabled: true,
      approvalsOnly: false,
    });
  const { state: shellState } = useMobileAppShell();

  useEffect(() => {
    let active = true;
    void loadConnectionConfig().then((loaded) => {
      if (!active) {
        return;
      }
      setConnectionConfig(loaded);
      setBaseUrlDraft(loaded.baseUrl ?? '');
    });
    void loadNotificationPreferences().then((loaded) => {
      if (!active) {
        return;
      }
      setNotificationPrefs(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const updateConnection = (next: ConnectionConfig) => {
    setConnectionConfig(next);
    void saveConnectionConfig(next);
  };

  const handleCommitBaseUrl = () => {
    const trimmed = baseUrlDraft.trim();
    const next = trimmed.length > 0 ? trimmed : null;
    if (next === connectionConfig.baseUrl) {
      return;
    }
    updateConnection({ baseUrl: next });
  };

  const updateNotifications = (next: NotificationPreferences) => {
    setNotificationPrefs(next);
    void saveNotificationPreferences(next);
  };

  const webDashboardUrl = resolveWebDashboardUrl(connectionConfig);
  const profile = resolveProfile(shellState, connectionConfig);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <Section
        label="Profile"
        description="Your platform-wide profile across Chat, Code, Work, and Lobby."
        footer="Edit your avatar and name on the desktop."
      >
        <View style={styles.profileCard}>
          <ProfileAvatar
            avatarUrl={profile.avatarUrl}
            avatarColor={profile.avatarColor}
            initials={profile.initials}
          />
          <View style={styles.profileText}>
            <Text style={styles.profileLabel}>Name</Text>
            <Text style={styles.profileName}>{profile.displayName}</Text>
          </View>
        </View>
      </Section>

      <Section
        label="Desktop"
        description="Where this device should reach your desktop cats."
      >
        <View style={styles.baseUrlRow}>
          <Text style={styles.baseUrlLabel}>Desktop URL</Text>
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
            Use the LAN address of the machine running cats. Saves on blur.
          </Text>
        </View>
      </Section>

      <Section
        label="Notifications"
        footer="Notification delivery is not yet enabled. Your choices are saved on this device."
      >
        <ToggleRow
          label="Push notifications"
          description="Alerts when an approval, escalation, or task completion lands."
          value={notificationPrefs.enabled}
          onValueChange={(enabled) =>
            updateNotifications({ ...notificationPrefs, enabled })
          }
        />
        <ToggleRow
          label="Approvals only"
          description="Suppress task completion and informational pushes."
          value={notificationPrefs.approvalsOnly}
          onValueChange={(approvalsOnly) =>
            updateNotifications({ ...notificationPrefs, approvalsOnly })
          }
          disabled={!notificationPrefs.enabled}
        />
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
                ? 'Set the desktop URL above to enable this link.'
                : `Opens ${webDashboardUrl}`}
            </Text>
          </View>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

interface ProfileFields {
  displayName: string;
  initials: string;
  avatarColor: string | null;
  avatarUrl: string | null;
}

function resolveProfile(
  shellState: ReturnType<typeof useMobileAppShell>['state'],
  connectionConfig: ConnectionConfig,
): ProfileFields {
  if (shellState.kind !== 'data') {
    return {
      displayName: 'Not connected',
      initials: '—',
      avatarColor: null,
      avatarUrl: null,
    };
  }
  const { ownerDisplayName, ownerAvatarColor, ownerAvatarUrl } =
    shellState.payload;
  const trimmed = ownerDisplayName.trim();
  const displayName = trimmed.length > 0 ? trimmed : 'Owner';
  const initials = nameInitials(displayName);
  const absoluteAvatarUrl = ownerAvatarUrl
    ? resolveAvatarAbsoluteUrl(ownerAvatarUrl, connectionConfig)
    : null;
  return {
    displayName,
    initials,
    avatarColor: ownerAvatarColor,
    avatarUrl: absoluteAvatarUrl,
  };
}

function nameInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function resolveAvatarAbsoluteUrl(
  avatarUrl: string,
  connectionConfig: ConnectionConfig,
): string | null {
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(avatarUrl) || avatarUrl.startsWith('data:')) {
    return avatarUrl;
  }
  if (!connectionConfig.baseUrl) {
    return null;
  }
  try {
    const client = createMobileApiClient(connectionConfig);
    return `${client.baseUrl}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`;
  } catch {
    return null;
  }
}

interface ProfileAvatarProps {
  avatarUrl: string | null;
  avatarColor: string | null;
  initials: string;
}

function ProfileAvatar({ avatarUrl, avatarColor, initials }: ProfileAvatarProps) {
  const fallbackColor = avatarColor ?? colors.bubble.mentionDefault;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatar, { backgroundColor: fallbackColor }]}
        accessibilityLabel="Owner avatar"
      />
    );
  }
  return (
    <View style={[styles.avatar, { backgroundColor: fallbackColor }]}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

interface SectionProps {
  label: string;
  description?: string;
  footer?: string;
  children: ReactNode;
}

function Section({ label, description, footer, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      {description ? (
        <Text style={styles.sectionDescription}>{description}</Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
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
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.fg.muted,
    ...typography.label,
    letterSpacing: 0.8,
  },
  sectionDescription: {
    color: colors.fg.secondary,
    ...typography.caption,
    paddingBottom: spacing.xs,
  },
  sectionFooter: {
    color: colors.fg.muted,
    ...typography.caption,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  sectionBody: {
    backgroundColor: colors.bg.panel,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  profileLabel: {
    color: colors.fg.muted,
    ...typography.label,
  },
  profileName: {
    color: colors.fg.primary,
    ...typography.title,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: colors.bubble.mentionText,
    ...typography.title,
    fontWeight: '700',
  },
  baseUrlRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
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
});
