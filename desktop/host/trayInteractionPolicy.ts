export type DesktopTrayContextMenuBinding = 'native-context-menu' | 'manual-right-click-popup';

export interface DesktopTrayInteractionPolicy {
  contextMenuBinding: DesktopTrayContextMenuBinding;
  singleLeftClick: 'show-window';
  doubleLeftClick: 'show-window';
  singleRightClick: 'show-context-menu';
}

export function resolveDesktopTrayInteractionPolicy(
  platform: NodeJS.Platform = process.platform,
): DesktopTrayInteractionPolicy {
  return {
    contextMenuBinding: platform === 'darwin'
      ? 'manual-right-click-popup'
      : 'native-context-menu',
    singleLeftClick: 'show-window',
    doubleLeftClick: 'show-window',
    singleRightClick: 'show-context-menu',
  };
}
