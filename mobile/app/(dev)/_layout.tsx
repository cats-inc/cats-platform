import { Stack } from 'expo-router';

import { colors } from '../../src/renderer/theme';

export default function DevLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.canvas },
        headerTintColor: colors.fg.primary,
        contentStyle: { backgroundColor: colors.bg.canvas },
      }}
    />
  );
}
