import { SafeAreaView, StyleSheet } from 'react-native';

import { Lobby } from '../../src/renderer/screens/Lobby';
import { colors } from '../../src/renderer/theme';

export default function LobbyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Lobby />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.canvas,
  },
});
