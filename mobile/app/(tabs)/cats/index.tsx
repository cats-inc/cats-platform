import { SafeAreaView, StyleSheet } from 'react-native';

import { CatsDirectoryTab } from '../../../src/renderer/screens/CatsDirectoryTab';
import { colors } from '../../../src/renderer/theme';

export default function CatsTabScreen() {
  return (
    <SafeAreaView style={styles.container}>
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
