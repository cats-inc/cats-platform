import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useLocation } from 'react-router-dom';

import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../../shared/sidebarPreference.js';
import { canvasSurfaceRouteRegistry } from '../../artifactCanvas/contracts.js';
import {
  createProductSidebarState,
  isProductSidebarOpen,
  setProductSidebarOpen,
  syncProductSidebarSplitView,
} from './productSidebarState.js';

export interface AppChromeController {
  accountMenuOpen: boolean;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  sidebarOpen: boolean;
  overflowMenuOpenId: string | null;
  setOverflowMenuOpenId: Dispatch<SetStateAction<string | null>>;
  plusMenuOpen: boolean;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  addCatOpen: boolean;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  channelPlusMenuOpen: boolean;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  accountMenuRef: RefObject<HTMLDivElement>;
  plusMenuRef: RefObject<HTMLDivElement>;
  addCatPanelRef: RefObject<HTMLDivElement>;
  fileInputRef: RefObject<HTMLInputElement>;
  channelPlusMenuRef: RefObject<HTMLDivElement>;
  channelFileInputRef: RefObject<HTMLInputElement>;
  autoResize: (element: HTMLTextAreaElement) => void;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

export function useAppChrome(): AppChromeController {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const location = useLocation();
  const splitViewActive = canvasSurfaceRouteRegistry.parse(location.pathname)?.kind === 'canvas';
  const [sidebarState, setSidebarState] = useState(() => createProductSidebarState(
    readSidebarOpenPreference(typeof window === 'undefined' ? null : window.localStorage),
    splitViewActive,
  ));
  // Sync during render rather than in an effect so a canvas that opens, or a
  // canvas URL loaded directly, never paints one frame with the full sidebar.
  if (sidebarState.splitViewActive !== splitViewActive) {
    setSidebarState((current) => syncProductSidebarSplitView(current, splitViewActive));
    if (splitViewActive) {
      setAccountMenuOpen(false);
    }
  }
  const sidebarOpen = isProductSidebarOpen(sidebarState);
  const [overflowMenuOpenId, setOverflowMenuOpenId] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [channelPlusMenuOpen, setChannelPlusMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const addCatPanelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelPlusMenuRef = useRef<HTMLDivElement>(null);
  const channelFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!overflowMenuOpenId && !plusMenuOpen && !channelPlusMenuOpen && !addCatOpen) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (overflowMenuOpenId) {
        const menu = document.querySelector('.recentOverflowMenu') ?? document.querySelector('.myCatOverflowMenu');
        const button = (event.target as Element).closest?.('.recentOverflowButton, .myCatOverflowButton');
        if (!menu?.contains(target) && !button) {
          setOverflowMenuOpenId(null);
        }
      }
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setPlusMenuOpen(false);
      }
      if (channelPlusMenuOpen && channelPlusMenuRef.current && !channelPlusMenuRef.current.contains(target)) {
        setChannelPlusMenuOpen(false);
      }
      if (addCatOpen && addCatPanelRef.current && !addCatPanelRef.current.contains(target)) {
        setAddCatOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overflowMenuOpenId, plusMenuOpen, channelPlusMenuOpen, addCatOpen]);

  useEffect(() => {
    writeSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
      sidebarState.preferenceOpen,
    );
  }, [sidebarState.preferenceOpen]);

  const autoResize = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    const maxHeight = 200;
    if (element.scrollHeight > maxHeight) {
      element.style.height = `${maxHeight}px`;
      element.style.overflowY = 'auto';
    } else {
      element.style.height = `${element.scrollHeight}px`;
      element.style.overflowY = 'hidden';
    }
  }, []);

  function onToggleSidebar(): void {
    if (sidebarOpen) {
      setAccountMenuOpen(false);
    }
    setSidebarState((current) => setProductSidebarOpen(current, !isProductSidebarOpen(current)));
  }

  function onCollapsedSidebarClick(event: ReactMouseEvent<HTMLElement>): void {
    if (sidebarOpen) {
      return;
    }

    const target = event.target as HTMLElement;
    if (
      target.closest('button, a, input, textarea, select, [role="button"]')
      || target.closest('.accountMenu')
    ) {
      return;
    }

    setSidebarState((current) => setProductSidebarOpen(current, true));
  }

  return {
    accountMenuOpen,
    setAccountMenuOpen,
    sidebarOpen,
    overflowMenuOpenId,
    setOverflowMenuOpenId,
    plusMenuOpen,
    setPlusMenuOpen,
    addCatOpen,
    setAddCatOpen,
    channelPlusMenuOpen,
    setChannelPlusMenuOpen,
    accountMenuRef,
    plusMenuRef,
    addCatPanelRef,
    fileInputRef,
    channelPlusMenuRef,
    channelFileInputRef,
    autoResize,
    onToggleSidebar,
    onCollapsedSidebarClick,
  };
}
