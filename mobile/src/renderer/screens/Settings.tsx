import { type ReactNode, useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
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
  loadLocalePreference,
  loadNotificationPreferences,
  resolveWebDashboardUrl,
  saveConnectionConfig,
  saveLocalePreference,
  saveNotificationPreferences,
} from '../../api/persistence';
import { useMobileAppShell } from '../hooks/useMobileAppShell';
import {
  getMobileSettingsCopy,
  resolveDefaultMobileLocale,
  setMobileLocaleOverride,
  type MobileLocaleOverride,
  type MobileSettingsCopy,
} from '../../../../src/mobile/index.js';
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
  const [localePreference, setLocalePreference] =
    useState<MobileLocaleOverride>('auto');
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const { state: shellState } = useMobileAppShell();
  // Resolved at render time; using `localePreference` as a key lets
  // the Settings screen re-render with the new copy immediately when
  // the user picks a different language, without waiting for the
  // app-wide reopen the footer mentions.
  const copy = getMobileSettingsCopy(resolveDefaultMobileLocale());

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
    void loadLocalePreference().then((loaded) => {
      if (!active) {
        return;
      }
      setLocalePreference(loaded);
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

  const updateLocalePreference = (next: MobileLocaleOverride) => {
    if (next === localePreference) {
      return;
    }
    setLocalePreference(next);
    setMobileLocaleOverride(next);
    void saveLocalePreference(next);
  };

  const webDashboardUrl = resolveWebDashboardUrl(connectionConfig);
  const profile = resolveProfile(shellState, connectionConfig, copy);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{copy.settingsTitle}</Text>
      </View>

      <Section
        label={copy.profileSection}
        description={copy.profileSectionDescription}
        footer={copy.profileFooter}
      >
        <View style={styles.profileCard}>
          <ProfileAvatar
            avatarUrl={profile.avatarUrl}
            avatarColor={profile.avatarColor}
            initials={profile.initials}
            accessibilityLabel={copy.ownerAvatarLabel}
          />
          <View style={styles.profileText}>
            <Text style={styles.profileLabel}>{copy.nameLabel}</Text>
            <Text style={styles.profileName}>{profile.displayName}</Text>
          </View>
        </View>
      </Section>

      <Section
        label={copy.desktopSection}
        description={copy.desktopSectionDescription}
      >
        <View style={styles.baseUrlRow}>
          <Text style={styles.baseUrlLabel}>{copy.desktopUrlLabel}</Text>
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
            {copy.baseUrlHint}
          </Text>
        </View>
      </Section>

      <Section
        label={copy.languageSection}
        description={copy.languageSectionDescription}
        footer={copy.languageReopenFooter}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.languagePreferenceLabel}
          accessibilityValue={{
            text: resolveLocaleOptionLabel(localePreference, copy),
          }}
          onPress={() => setLanguagePickerOpen(true)}
          style={({ pressed }) => [
            styles.languagePickerRow,
            pressed ? styles.languagePickerRowPressed : null,
          ]}
        >
          <Text style={styles.languagePickerLabel}>
            {copy.languagePreferenceLabel}
          </Text>
          <Text style={styles.languagePickerValue}>
            {resolveLocaleOptionLabel(localePreference, copy)}
          </Text>
          <Text style={styles.languagePickerChevron}>›</Text>
        </Pressable>
      </Section>

      <LanguagePickerModal
        visible={languagePickerOpen}
        copy={copy}
        selected={localePreference}
        onSelect={(next) => {
          updateLocalePreference(next);
          setLanguagePickerOpen(false);
        }}
        onClose={() => setLanguagePickerOpen(false)}
      />

      <Section
        label={copy.notificationsSection}
        footer={copy.notificationsFooter}
      >
        <ToggleRow
          label={copy.pushNotificationsLabel}
          description={copy.pushNotificationsDescription}
          value={notificationPrefs.enabled}
          onValueChange={(enabled) =>
            updateNotifications({ ...notificationPrefs, enabled })
          }
        />
        <ToggleRow
          label={copy.approvalsOnlyLabel}
          description={copy.approvalsOnlyDescription}
          value={notificationPrefs.approvalsOnly}
          onValueChange={(approvalsOnly) =>
            updateNotifications({ ...notificationPrefs, approvalsOnly })
          }
          disabled={!notificationPrefs.enabled}
        />
      </Section>

      <Section label={copy.advancedSection}>
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
              {copy.openWebDashboardLabel}
            </Text>
            <Text style={styles.linkRowDescription}>
              {webDashboardUrl === null
                ? copy.openWebDashboardDisabledDescription
                : copy.openWebDashboardDescription(webDashboardUrl)}
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
  copy: MobileSettingsCopy,
): ProfileFields {
  if (shellState.kind !== 'data') {
    return {
      displayName: copy.notConnectedName,
      initials: '—',
      avatarColor: null,
      avatarUrl: null,
    };
  }
  const { ownerDisplayName, ownerAvatarColor, ownerAvatarUrl } =
    shellState.payload;
  const trimmed = ownerDisplayName.trim();
  const displayName = trimmed.length > 0 ? trimmed : copy.ownerFallbackName;
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
  accessibilityLabel: string;
}

function ProfileAvatar({
  avatarUrl,
  avatarColor,
  initials,
  accessibilityLabel,
}: ProfileAvatarProps) {
  const fallbackColor = avatarColor ?? colors.bubble.mentionDefault;
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={[styles.avatar, { backgroundColor: fallbackColor }]}
        accessibilityLabel={accessibilityLabel}
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

function resolveLocaleOptionLabel(
  preference: MobileLocaleOverride,
  copy: MobileSettingsCopy,
): string {
  switch (preference) {
    case 'en':
      return copy.languageEnglishLabel;
    case 'zh-TW':
      return copy.languageTraditionalChineseLabel;
    case 'auto':
    default:
      return copy.languageAutoLabel;
  }
}

interface LanguagePickerModalProps {
  visible: boolean;
  copy: MobileSettingsCopy;
  selected: MobileLocaleOverride;
  onSelect: (next: MobileLocaleOverride) => void;
  onClose: () => void;
}

/**
 * iOS-style bottom-sheet picker for the display language. Tap a row
 * to commit the choice (and dismiss); tap the backdrop to dismiss
 * without changing.
 */
function LanguagePickerModal({
  visible,
  copy,
  selected,
  onSelect,
  onClose,
}: LanguagePickerModalProps) {
  const options: { id: MobileLocaleOverride; label: string; description?: string }[] = [
    {
      id: 'auto',
      label: copy.languageAutoLabel,
      description: copy.languageAutoDescription,
    },
    { id: 'en', label: copy.languageEnglishLabel },
    { id: 'zh-TW', label: copy.languageTraditionalChineseLabel },
  ];
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.languagePickerCloseLabel}
        onPress={onClose}
        style={styles.languageModalBackdrop}
      >
        <Pressable
          // Stop propagation — tapping the sheet itself shouldn't
          // dismiss it; only backdrop taps do.
          onPress={() => {}}
          style={styles.languageModalSheet}
        >
          <View style={styles.languageModalHeader}>
            <Text style={styles.languageModalTitle}>
              {copy.languagePreferenceLabel}
            </Text>
          </View>
          {options.map((option, index) => (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === option.id }}
              onPress={() => onSelect(option.id)}
              style={({ pressed }) => [
                styles.languageModalRow,
                index < options.length - 1 ? styles.languageModalRowDivider : null,
                pressed ? styles.languageModalRowPressed : null,
              ]}
            >
              <View style={styles.languageModalRowText}>
                <Text style={styles.languageModalRowLabel}>{option.label}</Text>
                {option.description ? (
                  <Text style={styles.languageModalRowDescription}>
                    {option.description}
                  </Text>
                ) : null}
              </View>
              {selected === option.id ? (
                <Text style={styles.languageModalCheck}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
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
    gap: spacing.md,
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
  languagePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  languagePickerRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  languagePickerLabel: {
    flex: 1,
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  languagePickerValue: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  languagePickerChevron: {
    color: colors.fg.muted,
    fontSize: 22,
    lineHeight: 22,
  },
  languageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  languageModalSheet: {
    backgroundColor: colors.bg.panel,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  languageModalHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  languageModalTitle: {
    color: colors.fg.primary,
    ...typography.bodyStrong,
  },
  languageModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  languageModalRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  languageModalRowPressed: {
    backgroundColor: colors.bg.panelHover,
  },
  languageModalRowText: {
    flex: 1,
    gap: 2,
  },
  languageModalRowLabel: {
    color: colors.fg.primary,
    ...typography.body,
  },
  languageModalRowDescription: {
    color: colors.fg.secondary,
    ...typography.caption,
  },
  languageModalCheck: {
    color: colors.accent.primary,
    ...typography.title,
    fontWeight: '600',
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
