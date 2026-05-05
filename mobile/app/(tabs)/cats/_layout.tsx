import { Stack } from 'expo-router';

import { colors } from '../../../src/renderer/theme';

/**
 * Stack layout for the Cats tab. Without this file expo-router would
 * surface every screen under `cats/` (`index`, `[id]`) as its own
 * top-level tab in the bottom tab bar. The Stack wrapper tells
 * expo-router "this whole folder is one tab with internal navigation"
 * so the tab bar shows only the parent `Tabs.Screen name="cats"`
 * entry from `(tabs)/_layout.tsx`.
 */
export default function CatsStackLayout() {
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
