import { normalizeDesktopTrayLocale, type DesktopTrayLocale } from './trayMenu.js';

// Electron windows ship without a context menu, so the host builds one from the
// renderer's `context-menu` params. Items use Electron roles so the native
// clipboard/edit commands run against the focused web contents.

export type DesktopContextMenuRole =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll';

export type DesktopContextMenuItem =
  | { type: 'separator' }
  | { role: DesktopContextMenuRole; label: string; enabled: boolean };

export interface DesktopContextMenuParams {
  isEditable: boolean;
  selectionText: string;
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

const CONTEXT_MENU_LABELS: Record<DesktopTrayLocale, Record<DesktopContextMenuRole, string>> = {
  en: {
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
  },
  'zh-TW': {
    undo: '復原',
    redo: '重做',
    cut: '剪下',
    copy: '複製',
    paste: '貼上',
    selectAll: '全選',
  },
};

export function buildDesktopContextMenuTemplate(
  params: DesktopContextMenuParams,
  localeInput?: string | null,
): DesktopContextMenuItem[] {
  const labels = CONTEXT_MENU_LABELS[normalizeDesktopTrayLocale(localeInput)];
  const item = (role: DesktopContextMenuRole, enabled: boolean): DesktopContextMenuItem => ({
    role,
    label: labels[role],
    enabled,
  });
  const { editFlags } = params;

  if (params.isEditable) {
    return [
      item('undo', editFlags.canUndo),
      item('redo', editFlags.canRedo),
      { type: 'separator' },
      item('cut', editFlags.canCut),
      item('copy', editFlags.canCopy),
      item('paste', editFlags.canPaste),
      { type: 'separator' },
      item('selectAll', editFlags.canSelectAll),
    ];
  }

  if (params.selectionText.trim().length > 0) {
    return [item('copy', editFlags.canCopy)];
  }

  // Right-clicking plain content without a selection keeps the default no-op.
  return [];
}
