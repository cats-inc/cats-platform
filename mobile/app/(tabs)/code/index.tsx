import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';

import { codeSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';

export default function CodeSidebarScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <TrimmedProductSidebar
        config={codeSidebarConfig}
        onPrimaryAction={(actionId) => {
          router.push(`/(tabs)/code/new-${actionId}`);
        }}
        onOpenMyLens={() => {
          router.push('/(tabs)/code/my-codes');
        }}
        onOpenRecents={() => {
          router.push('/(tabs)/code/recents');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
});
