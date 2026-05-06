import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CatsDirectoryTab } from '../../../src/renderer/screens/CatsDirectoryTab';
import { colors } from '../../../src/renderer/theme';

export default function CatsTabScreen() {
  // `edges={['top']}` only — bottom inset is owned by the
  // `Tabs.Screen` bar in `(tabs)/_layout.tsx`, which already
  // accounts for the home-indicator gutter on its own.
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <CatsDirectoryTab />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
});
