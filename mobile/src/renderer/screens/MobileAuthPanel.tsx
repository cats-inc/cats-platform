import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MobileApiError } from '../../api/client';
import { loginMobileLocalSession } from '../../api/authSession';
import { loadConnectionConfig } from '../../api/persistence';
import {
  getMobileAuthCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';
import { colors, radii, spacing, typography } from '../theme';

interface MobileAuthPanelProps {
  onAuthenticated: () => void;
}

export function MobileAuthPanel({ onAuthenticated }: MobileAuthPanelProps) {
  const copy = getMobileAuthCopy(resolveDefaultMobileLocale());
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (submitting) {
      return;
    }
    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier || !password) {
      setError(copy.missingCredentials);
      return;
    }
    setSubmitting(true);
    setError(null);
    void (async () => {
      try {
        const config = await loadConnectionConfig();
        const status = await loginMobileLocalSession(config, {
          identifier: trimmedIdentifier,
          password,
        });
        if (!status.authenticated) {
          setError(copy.loginFailedTitle);
          return;
        }
        setPassword('');
        onAuthenticated();
      } catch (caught) {
        setError(
          caught instanceof MobileApiError || caught instanceof Error
            ? caught.message
            : copy.loginFailedTitle,
        );
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{copy.loginTitle}</Text>
      <Text style={styles.body}>{copy.loginBody}</Text>
      <View style={styles.form}>
        <Text style={styles.label}>{copy.emailLabel}</Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="owner@example.com"
          placeholderTextColor={colors.fg.muted}
          style={styles.input}
        />
        <Text style={styles.label}>{copy.passwordLabel}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.fg.muted}
          style={styles.input}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: submitting, disabled: submitting }}
          disabled={submitting}
          onPress={submit}
          style={({ pressed }) => [
            styles.button,
            pressed && !submitting ? styles.buttonPressed : null,
            submitting ? styles.buttonDisabled : null,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.fg.inverse} size="small" />
          ) : (
            <Text style={styles.buttonLabel}>{copy.signInAction}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
  },
  title: {
    color: colors.fg.primary,
    ...typography.title,
  },
  body: {
    color: colors.fg.secondary,
    ...typography.body,
  },
  form: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  label: {
    color: colors.fg.muted,
    ...typography.label,
  },
  input: {
    color: colors.fg.primary,
    ...typography.body,
    backgroundColor: colors.bg.panel,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: {
    color: colors.accent.danger,
    ...typography.caption,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent.primary,
    borderRadius: radii.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.fg.inverse,
    ...typography.bodyStrong,
  },
});
