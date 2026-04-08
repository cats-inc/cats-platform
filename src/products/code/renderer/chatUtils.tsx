export * from '../../shared/renderer/workspaceChatUtils.js';

import { renderBootShell } from '../../shared/renderer/workspaceChatUtils.js';

export function BootShell() {
  return renderBootShell('Code');
}
