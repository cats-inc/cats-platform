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

import {
  readSidebarOpenPreference,
  writeSidebarOpenPreference,
} from '../../../shared/sidebarPreference.js';

export interface AppChromeController {
  accountMenuOpen: boolean;
  setAccountMenuOpen: Dispatch<SetStateAction<boolean>>;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  overflowMenuOpenId: string | null;
  setOverflowMenuOpenId: Dispatch<SetStateAction<string | null>>;
  plusMenuOpen: boolean;
  setPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  addCatOpen: boolean;
  setAddCatOpen: Dispatch<SetStateAction<boolean>>;
  channelPlusMenuOpen: boolean;
  setChannelPlusMenuOpen: Dispatch<SetStateAction<boolean>>;
  accountMenuRef: RefObject<HTMLDivElement | null>;
  plusMenuRef: RefObject<HTMLDivElement | null>;
  addCatPanelRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  channelPlusMenuRef: RefObject<HTMLDivElement | null>;
  channelFileInputRef: RefObject<HTMLInputElement | null>;
  autoResize: (element: HTMLTextAreaElement) => void;
  onToggleSidebar: () => void;
  onCollapsedSidebarClick: (event: ReactMouseEvent<HTMLElement>) => void;
}

export function useAppChrome(): AppChromeController {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readSidebarOpenPreference(typeof window === 'undefined' ? null : window.localStorage),
  );
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
    if (!accountMenuOpen && !overflowMenuOpenId && !plusMenuOpen && !channelPlusMenuOpen && !addCatOpen) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (accountMenuOpen && accountMenuRef.current && !accountMenuRef.current.contains(target)) {
        setAccountMenuOpen(false);
      }
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
  }, [accountMenuOpen, overflowMenuOpenId, plusMenuOpen, channelPlusMenuOpen, addCatOpen]);

  useEffect(() => {
    writeSidebarOpenPreference(
      typeof window === 'undefined' ? null : window.localStorage,
      sidebarOpen,
    );
  }, [sidebarOpen]);

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
    setSidebarOpen((current) => {
      if (current) {
        setAccountMenuOpen(false);
      }
      return !current;
    });
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

    setSidebarOpen(true);
  }

  return {
    accountMenuOpen,
    setAccountMenuOpen,
    sidebarOpen,
    setSidebarOpen,
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
