import { getMobileDeleteConfirmationCopy } from '../../../../src/mobile/index.js';

interface DeleteAlertButton {
  text: string;
  style: 'cancel' | 'destructive';
  onPress?: () => void;
}

export function confirmRecentDeletion(
  locale: string,
  alert: (title: string, message: string, buttons: DeleteAlertButton[]) => void,
  remove: () => void,
): void {
  const copy = getMobileDeleteConfirmationCopy(locale);
  alert(copy.title, copy.message, [
    { text: copy.cancel, style: 'cancel' },
    { text: copy.confirm, style: 'destructive', onPress: remove },
  ]);
}
