import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ProductScope } from '../../../../shared/productScope.js';
import type { MessageInterpolationValues, MessageKey } from '../../../../shared/i18n/index.js';
import type { ShowToast } from '../../../../design/components/Toast.js';
import { raiseProductScope } from '../api/productScope.js';
import {
  describeProductScopeRaiseFailure,
  productScopeRaisedNotice,
  type ProductScopeRaiseControl,
} from '../productScopeRaise.js';

type Translate = (key: MessageKey, values?: MessageInterpolationValues) => string;

export interface ProductScopeRaiseOptions {
  /** The conversation the owner is looking at now. */
  routeChannelId: string | null;
  refreshAppShell: () => void;
  showToast: ShowToast;
  t: Translate;
  raise?: typeof raiseProductScope;
}

/**
 * SPEC-141 FR-30: the owner's raise from Desktop.
 *
 * The conversation moves by the origin redirect that already follows a scope change: once the app
 * shell shows the new scope, that redirect opens the conversation under the new product. Either
 * the raise's response or its update event may get there first, so the toast that names the new
 * product is recorded before the request goes out and handed to whichever redirect comes. The new
 * product's app shows it. A refusal shows its reason here and the conversation stays.
 */
export function useProductScopeRaise(options: ProductScopeRaiseOptions): {
  control: ProductScopeRaiseControl;
  takeRedirectNotice: (channelId: string, surface: ProductScope) => string | undefined;
} {
  const { refreshAppShell, showToast, t } = options;
  const raiseRequest = options.raise ?? raiseProductScope;
  const [pendingChannelId, setPendingChannelId] = useState<string | null>(null);
  // Locked in the handler: one raise at a time, whatever the buttons show.
  const lockRef = useRef<string | null>(null);
  const noticeRef = useRef<{ channelId: string; target: ProductScope; notice: string } | null>(null);
  const routeChannelIdRef = useRef(options.routeChannelId);
  routeChannelIdRef.current = options.routeChannelId;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const raise = useCallback(async (channelId: string, target: ProductScope, revision: string): Promise<void> => {
    if (lockRef.current !== null) return;
    lockRef.current = channelId;
    setPendingChannelId(channelId);
    const notice = productScopeRaisedNotice(target, t);
    noticeRef.current = { channelId, target, notice };
    try {
      await raiseRequest(channelId, target, revision);
      // The redirect already took the owner there and this app is gone.
      if (!mountedRef.current) return;
      if (routeChannelIdRef.current !== channelId && noticeRef.current?.channelId === channelId) {
        // The owner went elsewhere meanwhile: say so here and leave them where they are.
        noticeRef.current = null;
        showToast(notice);
      }
      refreshAppShell();
    } catch (error) {
      if (noticeRef.current?.channelId === channelId) noticeRef.current = null;
      if (mountedRef.current) showToast(describeProductScopeRaiseFailure(error, t));
    } finally {
      lockRef.current = null;
      if (mountedRef.current) setPendingChannelId(null);
    }
  }, [raiseRequest, refreshAppShell, showToast, t]);

  const report = useCallback((message: string) => showToast(message), [showToast]);

  const takeRedirectNotice = useCallback((channelId: string, surface: ProductScope): string | undefined => {
    const pending = noticeRef.current;
    if (!pending || pending.channelId !== channelId || pending.target !== surface) return undefined;
    noticeRef.current = null;
    return pending.notice;
  }, []);

  const control = useMemo<ProductScopeRaiseControl>(
    () => ({ pendingChannelId, raise, report }),
    [pendingChannelId, raise, report],
  );
  return { control, takeRedirectNotice };
}
