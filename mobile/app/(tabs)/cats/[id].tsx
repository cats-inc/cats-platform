import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileCatDetail } from '../../../src/renderer/screens/MobileCatDetail';

/** A Cat's screen; it titles itself with the Cat's name once loaded. */
export default function MobileCatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: '', headerShown: true }} />
      <MobileCatDetail catId={typeof id === 'string' ? id : ''} />
    </>
  );
}
