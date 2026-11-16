import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileGroupDetail } from '../../../../src/renderer/screens/MobileGroupDetail';
import { getMobileDirectoryCopy } from '../../../../../src/mobile/index.js';
import { useMobileLocale } from '../../../../src/renderer/hooks/useMobileLocale';

/** A Clowder's home, pushed on the Cats tab's stack so the back gesture returns to it. */
export default function MobileClowderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const copy = getMobileDirectoryCopy(useMobileLocale());
  return (
    <>
      <Stack.Screen options={{ title: copy.clowderTitle, headerShown: true }} />
      <MobileGroupDetail kind="clowder" id={typeof id === 'string' ? id : ''} />
    </>
  );
}
