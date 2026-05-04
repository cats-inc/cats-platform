import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileEntityDetail } from '../../../src/renderer/screens/MobileEntityDetail';
import {
  getMobileLobbyCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

export default function MobileClowderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const copy = getMobileLobbyCopy(resolveDefaultMobileLocale());
  const resolvedId = typeof id === 'string' && id.length > 0 ? id : 'unknown-clowder';

  return (
    <>
      <Stack.Screen options={{ title: copy.entityDetailTitleClowder, headerShown: true }} />
      <MobileEntityDetail kind="clowder" id={resolvedId} />
    </>
  );
}
