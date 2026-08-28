// Locale normalization is shared with the tray and the notifications rather
// than duplicated. The main process has no i18n runtime, so every surface it
// owns resolves its own copy from the same two-locale rule.
import {
  normalizeDesktopTrayLocale,
  type DesktopTrayLocale,
} from './trayMenu.js';

/**
 * Confirmation shown before a tray-driven install.
 *
 * The tray can now finish an update on its own, which means the last click
 * before the app exits no longer passes through Settings — and Settings was
 * the only place that said what installing actually does. This module owns
 * that copy so the policy stays testable without Electron; `main.ts` only
 * renders the dialog it describes.
 *
 * The three platforms do genuinely different things, and the differences are
 * the parts a user would want to know before committing:
 *
 * - Windows hands off to an assisted NSIS installer, so a wizard appears and
 *   may ask where to install.
 * - Linux installs a .deb through dpkg, which asks for a password. SPEC-111
 *   section 8 is explicit that the "no elevation prompt" guarantee covers the
 *   per-user Windows installer only and does not extend here.
 * - macOS replaces the installed app in place with no prompt of its own.
 *
 * All three relaunch afterwards, which configureElectronUpdater pins through
 * autoRunAppAfterInstall.
 */
export interface DesktopInstallConfirmation {
  title: string;
  message: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
}

interface InstallConfirmationCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  windowsDetail: string;
  linuxDetail: string;
  macosDetail: string;
  genericDetail: string;
}

const INSTALL_CONFIRMATION_COPY: Record<DesktopTrayLocale, InstallConfirmationCopy> = {
  en: {
    title: 'Install the update?',
    message: 'Cats will close to install the update.',
    confirmLabel: 'Install and Restart',
    cancelLabel: 'Cancel',
    windowsDetail:
      'The Windows installer will open and may ask you to confirm the installation folder. '
      + 'Cats reopens once it finishes.',
    linuxDetail:
      'The update is installed with dpkg, which asks for your password. '
      + 'Cats reopens once it finishes.',
    macosDetail: 'The installed app is replaced in place. Cats reopens once it finishes.',
    genericDetail: 'Cats reopens once the install finishes.',
  },
  'zh-TW': {
    title: '要安裝更新嗎？',
    message: 'Cats 將會關閉以安裝更新。',
    confirmLabel: '安裝並重新啟動',
    cancelLabel: '取消',
    windowsDetail: 'Windows 安裝程式會開啟，過程中可能需要你確認安裝資料夾。完成後 Cats 會自動重新開啟。',
    linuxDetail: '更新會透過 dpkg 安裝，過程中需要輸入你的密碼。完成後 Cats 會自動重新開啟。',
    macosDetail: '已安裝的應用程式會被就地取代。完成後 Cats 會自動重新開啟。',
    genericDetail: '安裝完成後 Cats 會自動重新開啟。',
  },
};

function resolveDetail(
  copy: InstallConfirmationCopy,
  platform: NodeJS.Platform | string,
): string {
  if (platform === 'win32') {
    return copy.windowsDetail;
  }
  if (platform === 'linux') {
    return copy.linuxDetail;
  }
  if (platform === 'darwin') {
    return copy.macosDetail;
  }
  // No packaged installer exists for anything else, so say only what holds
  // everywhere rather than describing a mechanism that is not there.
  return copy.genericDetail;
}

export function resolveDesktopInstallConfirmation(input: {
  platform: NodeJS.Platform | string;
  locale?: string | null;
}): DesktopInstallConfirmation {
  const copy = INSTALL_CONFIRMATION_COPY[normalizeDesktopTrayLocale(input.locale)];

  return {
    title: copy.title,
    message: copy.message,
    detail: resolveDetail(copy, input.platform),
    confirmLabel: copy.confirmLabel,
    cancelLabel: copy.cancelLabel,
  };
}
