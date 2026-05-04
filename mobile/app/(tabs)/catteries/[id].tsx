import { Stack, useLocalSearchParams } from 'expo-router';

import { MobileEntityDetail } from '../../../src/renderer/screens/MobileEntityDetail';
import {
  getMobileLobbyCopy,
  resolveDefaultMobileLocale,
} from '../../../../src/mobile/index.js';

export default function MobileCatteryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const copy = getMobileLobbyCopy(resolveDefaultMobileLocale());
  const resolvedId = typeof id === 'string' && id.length > 0 ? id : 'unknown-cattery';

  return (
    <>
      <Stack.Screen options={{ title: copy.entityDetailTitleCattery, headerShown: true }} />
      <MobileEntityDetail kind="cattery" id={resolvedId} />
    </>
  );
}
