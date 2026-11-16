import { Stack } from 'expo-router';

import { MobileCatCreate } from '../../../src/renderer/screens/MobileCatCreate';
import { getMobileCatCopy } from '../../../../src/mobile/index.js';
import { useMobileLocale } from '../../../src/renderer/hooks/useMobileLocale';

/** A new Cat. The static `new` segment wins over `[id]`. */
export default function MobileNewCatScreen() {
  const copy = getMobileCatCopy(useMobileLocale());
  return (
    <>
      <Stack.Screen options={{ title: copy.newCatTitle, headerShown: true }} />
      <MobileCatCreate />
    </>
  );
}
