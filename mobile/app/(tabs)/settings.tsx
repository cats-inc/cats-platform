import { SafeAreaView, StyleSheet } from 'react-native';

import { Settings } from '../../src/renderer/screens/Settings';
import { colors } from '../../src/renderer/theme';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Settings />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
});
