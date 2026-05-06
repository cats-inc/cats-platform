import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

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
    <View style={{ flex: 1, backgroundColor: colors.bg.canvas }}>
      <StatusBar style="dark" />
      {localeReady ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      ) : null}
    </View>
  );
}
