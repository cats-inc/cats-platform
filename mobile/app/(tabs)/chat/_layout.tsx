import { Stack } from 'expo-router';

import { colors } from '../../../src/renderer/theme';

/**
 * Stack layout for the Chat tab. Without this file expo-router would
 * surface every screen under `chat/` (`index`, `[channelId]`) as its
 * own top-level tab in the bottom tab bar. The Stack wrapper tells
 * expo-router "this whole folder is one tab with internal navigation"
 * so the tab bar shows only the parent `Tabs.Screen name="chat"`
 * entry from `(tabs)/_layout.tsx`.
 */
export default function ChatStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.canvas },
        headerTintColor: colors.fg.primary,
        contentStyle: { backgroundColor: colors.bg.canvas },
        headerShown: false,
        // Drop the "< index" fallback iOS shows when the previous
        // screen is the unnamed `index.tsx`. `headerBackTitle: ''`
        // doesn't take effect on native-stack 7 (the back-button
        // text falls back to the previous route name regardless);
        // `headerBackButtonDisplayMode: 'minimal'` is the
        // documented way to render only the chevron.
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
