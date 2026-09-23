import electronUpdater from 'electron-updater';

/** Keep the production HTTP executor and replace only Linux's relaunch path. */
export class LinuxDesktopUpdater extends electronUpdater.DebUpdater {
  constructor(relaunch: () => void) {
    // Passing a custom AppAdapter into super() selects upstream's test mode and
    // omits its ElectronHttpExecutor. Preserve normal production construction.
    super();
    this.app.relaunch = relaunch;
  }
}
