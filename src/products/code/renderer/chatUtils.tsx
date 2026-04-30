export * from '../../shared/renderer/workspaceChatUtils.js';

import { renderBootShell } from '../../shared/renderer/workspaceChatUtils.js';
import { useI18n } from '../../../app/renderer/i18n/index.js';

export function BootShell() {
  const { t } = useI18n();

  return renderBootShell('Code', t);
}
