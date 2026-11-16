import { Stack } from 'expo-router';

import { MobileGroupCreate } from '../../../../src/renderer/screens/MobileGroupCreate';
import { getMobileDirectoryEditCopy } from '../../../../../src/mobile/index.js';
import { useMobileLocale } from '../../../../src/renderer/hooks/useMobileLocale';

/** A new Cattery. The static `new` segment wins over `[id]`. */
export default function MobileNewCatteryScreen() {
  const copy = getMobileDirectoryEditCopy(useMobileLocale());
  return (
    <>
      <Stack.Screen options={{ title: copy.newCatteryTitle, headerShown: true }} />
      <MobileGroupCreate kind="cattery" presetCatteryId={null} />
    </>
  );
}
