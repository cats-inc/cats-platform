import { Stack } from 'expo-router';

import { colors } from '../../../src/renderer/theme';

/**
 * Stack layout for the Code tab. Same reason as `chat/_layout.tsx` —
 * without this file expo-router auto-discovers `index`, `[channelId]`,
 * `my-codes`, and `recents` as four separate top-level tabs.
 */
export default function CodeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.canvas },
        headerTintColor: colors.fg.primary,
        contentStyle: { backgroundColor: colors.bg.canvas },
        headerShown: false,
      }}
    />
  );
}
