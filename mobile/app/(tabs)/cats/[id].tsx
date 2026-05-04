import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileEntityDetail } from '../../../src/renderer/screens/MobileEntityDetail';
import {
  getMobileLobbyCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

export default function MobileCatDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const copy = getMobileLobbyCopy(resolveDefaultMobileLocale());
  const resolvedId = typeof id === 'string' && id.length > 0 ? id : 'unknown-cat';

  return (
    <>
      <Stack.Screen options={{ title: copy.entityDetailTitleCat, headerShown: true }} />
      <MobileEntityDetail kind="cat" id={resolvedId} />
    </>
  );
}
