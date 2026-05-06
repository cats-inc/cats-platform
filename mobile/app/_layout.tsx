import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadLocalePreference } from '../src/api/persistence';
import { colors } from '../src/renderer/theme';
import { setMobileLocaleOverride } from '../../src/mobile/index.js';

export default function RootLayout() {
  // Apply the persisted display-language override before the first
  // render of any tab. Until the AsyncStorage read resolves we keep
  // the tree unmounted — otherwise screens would mount with the
  // device default locale and then stay on it (each call site
  // captures the locale at render time). One quick async hop on
  // boot is cheaper than threading a re-render-on-locale-change
  // contract through every screen.
  const [localeReady, setLocaleReady] = useState(false);

  // Explicitly preload the icon font that the bottom-tab rail
  // (`(tabs)/_layout.tsx`) consumes via `<MaterialCommunityIcons />`.
  // `@expo/vector-icons` ships the .ttf inside the package, but
  // without this `useFonts` call Expo CLI's manifest probe in
  // offline mode warns "Unable to resolve manifest assets. Icons
  // and fonts might not work" — and on cold start the rail can
  // briefly render with missing-glyph boxes before the font
  // resolves. Preloading at the root before the (tabs) Stack
  // mounts removes both rough edges.
  const [iconFontsLoaded] = useFonts(MaterialCommunityIcons.font);

  useEffect(() => {
    let cancelled = false;
    void loadLocalePreference().then((preference) => {
      if (cancelled) {
        return;
      }
      setMobileLocaleOverride(preference);
      setLocaleReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    // SafeAreaProvider feeds insets to every `SafeAreaView` from
    // `react-native-safe-area-context` in the tree. Required for
    // Android — RN's built-in `SafeAreaView` only respects the iOS
    // notch, leaving the Android system status bar (clock / battery
    // / wifi) overlapping our content. Library version handles both
    // platforms uniformly via the provider's measured insets.
    //
    // GestureHandlerRootView is required by `react-native-gesture-handler`
    // (used by the swipe-to-delete on Recents rows). Putting it at
    // the root layer ensures every Swipeable / pan / tap registered
    // anywhere in the tree gets routed through the native gesture
    // system instead of silently no-op'ing on Android.
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
        <StatusBar style="dark" />
        {localeReady && iconFontsLoaded ? (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        ) : null}
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
