import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileGroupCreate } from '../../../../src/renderer/screens/MobileGroupCreate';
import { getMobileDirectoryEditCopy } from '../../../../../src/mobile/index.js';
import { useMobileLocale } from '../../../../src/renderer/hooks/useMobileLocale';

/** A new Clowder, optionally already in the Cattery given as `?cattery=`. The static `new` segment wins over `[id]`. */
export default function MobileNewClowderScreen() {
  const { cattery } = useLocalSearchParams<{ cattery?: string }>();
  const copy = getMobileDirectoryEditCopy(useMobileLocale());
  return (
    <>
      <Stack.Screen options={{ title: copy.newClowderTitle, headerShown: true }} />
      <MobileGroupCreate kind="clowder" presetCatteryId={typeof cattery === 'string' && cattery ? cattery : null} />
    </>
  );
}
