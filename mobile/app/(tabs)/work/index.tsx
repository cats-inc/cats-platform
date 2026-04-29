import { useRouter } from 'expo-router';
import { SafeAreaView, StyleSheet } from 'react-native';

import { workSidebarConfig } from '../../../src/api/fixtures/productSidebar';
import { TrimmedProductSidebar } from '../../../src/renderer/sidebars/TrimmedProductSidebar';
import { colors } from '../../../src/renderer/theme';

export default function WorkSidebarScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <TrimmedProductSidebar
        config={workSidebarConfig}
        onPrimaryAction={(actionId) => {
          router.push(`/(tabs)/work/new-${actionId}`);
        }}
        onOpenMyLens={() => {
          router.push('/(tabs)/work/my-works');
        }}
        onOpenRecents={() => {
          router.push('/(tabs)/work/recents');
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
