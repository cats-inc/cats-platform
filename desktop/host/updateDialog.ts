import type { DesktopUpdateSnapshot } from './contracts.js';
// Locale normalization is shared with the tray and the notifications rather
// than duplicated. The main process has no i18n runtime, so every surface it
// owns resolves its own copy from the same two-locale rule.
import {
  normalizeDesktopTrayLocale,
  type DesktopTrayLocale,
} from './trayMenu.js';

/**
 * What the tray's update dialog says, and what confirming it should do.
 *
 * The tray item is a question with one fixed label; this is the answer. A tray
 * menu closes the moment it is clicked, so any result carried by the menu
 * itself would require the user to reopen it — and any label that changed with
 * the state would have to be re-read before every press to learn what pressing
 * it means now. Putting the whole answer in a native modal costs the user one
 * click and tells them everything: where the update got to, what it will do,
 * and whether there is a decision to make.
 *
 * A modal is the right surface here precisely because the user asked for it.
 * An unprompted one would be intrusive; this one is the direct response to a
 * click, and it is the only surface in a tray-first flow that can hold a
 * version, an explanation and two buttons at once.
 */
export type DesktopUpdateDialogAction = 'none' | 'check' | 'update' | 'install';

export interface DesktopUpdateDialog {
  title: string;
  message: string;
  detail: string;
  /** First entry is the default; the last is always the dismissal. */
  buttons: string[];
  /** What pressing the first button should do. `none` means informational. */
  action: DesktopUpdateDialogAction;
}

interface UpdateDialogCopy {
  checkTitle: string;
  upToDateTitle: string;
  upToDateMessage: (version: string) => string;
  availableTitle: string;
  availableMessage: (version: string) => string;
  downloadedTitle: string;
  downloadedMessage: string;
  downloadingTitle: string;
  downloadingMessage: (percent: number) => string;
  checkingTitle: string;
  checkingMessage: string;
  installingTitle: string;
  installingMessage: string;
  failedTitle: string;
  failedMessage: string;
  unavailableTitle: string;
  unavailableMessage: string;
  currentVersion: (version: string) => string;
  waitDetail: string;
  updateAndRestart: string;
  installAndRestart: string;
  later: string;
  ok: string;
  previewSuffix: string;
  windowsDetail: string;
  linuxDetail: string;
  macosDetail: string;
  genericDetail: string;
}

const UPDATE_DIALOG_COPY: Record<DesktopTrayLocale, UpdateDialogCopy> = {
  en: {
    checkTitle: 'Check for Updates',
    upToDateTitle: 'Cats is up to date',
    upToDateMessage: (version) => `Cats ${version} is the latest version.`,
    availableTitle: 'Update available',
    availableMessage: (version) => `Cats ${version} is available.`,
    downloadedTitle: 'Update ready to install',
    downloadedMessage: 'The update is downloaded and ready to install.',
    downloadingTitle: 'Downloading update',
    downloadingMessage: (percent) => `Downloading the update… ${percent}%`,
    checkingTitle: 'Checking for updates',
    checkingMessage: 'Cats is checking for updates.',
    installingTitle: 'Installing update',
    installingMessage: 'Cats is handing off to the installer.',
    failedTitle: 'Update check failed',
    failedMessage: 'The update could not be completed.',
    unavailableTitle: 'Updates are unavailable',
    unavailableMessage: 'This installation cannot update itself.',
    currentVersion: (version) => `You are running Cats ${version}.`,
    waitDetail: 'You can close this and carry on; Cats will keep going.',
    updateAndRestart: 'Update and Restart',
    installAndRestart: 'Install and Restart',
    later: 'Later',
    ok: 'OK',
    previewSuffix: ' (preview)',
    windowsDetail:
      'Cats will download the update, then close to install it. The Windows installer will open '
      + 'and may ask you to confirm the installation folder. Cats reopens once it finishes.',
    linuxDetail:
      'Cats will download the update, then close to install it. The update is installed with '
      + 'dpkg, which asks for your password. Cats reopens once it finishes.',
    macosDetail:
      'Cats will download the update, then close to install it. The installed app is replaced '
      + 'in place. Cats reopens once it finishes.',
    genericDetail:
      'Cats will download the update, then close to install it. Cats reopens once it finishes.',
  },
  'zh-TW': {
    checkTitle: '檢查更新',
    upToDateTitle: 'Cats 已是最新版本',
    upToDateMessage: (version) => `Cats ${version} 已是最新版本。`,
    availableTitle: '有可用更新',
    availableMessage: (version) => `Cats ${version} 可以使用。`,
    downloadedTitle: '更新已可安裝',
    downloadedMessage: '更新已下載完成，可以安裝了。',
    downloadingTitle: '正在下載更新',
    downloadingMessage: (percent) => `正在下載更新… ${percent}%`,
    checkingTitle: '正在檢查更新',
    checkingMessage: 'Cats 正在檢查更新。',
    installingTitle: '正在安裝更新',
    installingMessage: 'Cats 正在交給安裝程式處理。',
    failedTitle: '更新失敗',
    failedMessage: '這次更新無法完成。',
    unavailableTitle: '無法更新',
    unavailableMessage: '這個安裝方式無法自我更新。',
    currentVersion: (version) => `你目前使用的是 Cats ${version}。`,
    waitDetail: '你可以關掉這個視窗繼續操作，Cats 會在背景繼續進行。',
    updateAndRestart: '更新並重新啟動',
    installAndRestart: '安裝並重新啟動',
    later: '稍後',
    ok: '確定',
    previewSuffix: '（預覽）',
    windowsDetail:
      'Cats 會下載更新，然後關閉以安裝。Windows 安裝程式會開啟，過程中可能需要你確認安裝資料夾。'
      + '完成後 Cats 會自動重新開啟。',
    linuxDetail:
      'Cats 會下載更新，然後關閉以安裝。更新會透過 dpkg 安裝，過程中需要輸入你的密碼。'
      + '完成後 Cats 會自動重新開啟。',
    macosDetail:
      'Cats 會下載更新，然後關閉以安裝。已安裝的應用程式會被就地取代。'
      + '完成後 Cats 會自動重新開啟。',
    genericDetail: 'Cats 會下載更新，然後關閉以安裝。完成後 Cats 會自動重新開啟。',
  },
};

function resolveInstallDetail(
  copy: UpdateDialogCopy,
  platform: NodeJS.Platform | string,
): string {
  if (platform === 'win32') return copy.windowsDetail;
  if (platform === 'linux') return copy.linuxDetail;
  if (platform === 'darwin') return copy.macosDetail;
  // No packaged installer exists for anything else, so say only what holds
  // everywhere rather than describing a mechanism that is not there.
  return copy.genericDetail;
}

/**
 * The dialog for the state the host is in right now.
 *
 * `check` is returned when nothing is known yet: the caller runs a check and
 * then asks again with the fresh snapshot, so the decision of what to show
 * stays here rather than being spread across the caller.
 */
export function resolveDesktopUpdateDialog(input: {
  snapshot: DesktopUpdateSnapshot;
  platform: NodeJS.Platform | string;
  locale?: string | null;
}): DesktopUpdateDialog {
  const { snapshot } = input;
  const copy = UPDATE_DIALOG_COPY[normalizeDesktopTrayLocale(input.locale)];
  // A preview self-updates from an unsigned prerelease feed. A tester who
  // cannot tell that apart from a supported release cannot report usefully.
  const suffix = snapshot.capability.distribution === 'preview_packaged'
    ? copy.previewSuffix
    : '';
  const titled = (title: string): string => `${title}${suffix}`;

  if (!snapshot.capability.canCheck) {
    return {
      title: titled(copy.unavailableTitle),
      message: copy.unavailableMessage,
      detail: copy.currentVersion(snapshot.currentVersion),
      buttons: [copy.ok],
      action: 'none',
    };
  }

  switch (snapshot.status) {
    case 'update_available':
      return {
        title: titled(copy.availableTitle),
        message: copy.availableMessage(snapshot.availableVersion ?? ''),
        detail: `${copy.currentVersion(snapshot.currentVersion)} `
          + resolveInstallDetail(copy, input.platform),
        buttons: [copy.updateAndRestart, copy.later],
        action: 'update',
      };

    case 'downloaded':
      return {
        title: titled(copy.downloadedTitle),
        message: copy.downloadedMessage,
        detail: resolveInstallDetail(copy, input.platform),
        buttons: [copy.installAndRestart, copy.later],
        action: 'install',
      };

    case 'downloading':
      return {
        title: titled(copy.downloadingTitle),
        message: copy.downloadingMessage(Math.round(snapshot.progress?.percent ?? 0)),
        detail: copy.waitDetail,
        buttons: [copy.ok],
        action: 'none',
      };

    case 'checking':
      return {
        title: titled(copy.checkingTitle),
        message: copy.checkingMessage,
        detail: copy.waitDetail,
        buttons: [copy.ok],
        action: 'none',
      };

    case 'installing':
      return {
        title: titled(copy.installingTitle),
        message: copy.installingMessage,
        detail: copy.waitDetail,
        buttons: [copy.ok],
        action: 'none',
      };

    case 'up_to_date':
      return {
        title: titled(copy.upToDateTitle),
        message: copy.upToDateMessage(snapshot.currentVersion),
        detail: '',
        buttons: [copy.ok],
        action: 'none',
      };

    case 'failed':
      return {
        title: titled(copy.failedTitle),
        message: copy.failedMessage,
        detail: copy.currentVersion(snapshot.currentVersion),
        buttons: [copy.ok],
        action: 'none',
      };

    default:
      // idle: nothing has been asked yet, so the click means "go and find out".
      return {
        title: titled(copy.checkTitle),
        message: copy.checkingMessage,
        detail: '',
        buttons: [copy.ok],
        action: 'check',
      };
  }
}
