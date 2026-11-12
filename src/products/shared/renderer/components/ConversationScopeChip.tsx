import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { readProductScope, type ProductScope, type ProductScopeSource } from '../../../../shared/productScope.js';
import { messageKeys } from '../../../../shared/i18n/index.js';
import { useI18n } from '../../../../app/renderer/i18n/useI18n.js';
import { fetchProductScopeRaise, type ProductScopeRaiseView } from '../api/productScope.js';
import {
  buildProductScopeRaiseConfirmation,
  describeProductScopeReadFailure,
  describeProductScopeRaiseRefusal,
  productScopeLabel,
  productScopeRaiseMenuLevels,
  type ProductScopeRaiseControl,
} from '../productScopeRaise.js';
import { capitalize, ComposerSurfaceChip, renderSurfaceIcon } from './ComposerSurfaceChip.js';

export interface ConversationScopeChipProps {
  channel: ProductScopeSource & { id: string; status?: unknown };
  parallelMember: boolean;
  /** Absent where the product app offers no raise; the chip then only names the scope. */
  control?: ProductScopeRaiseControl;
}

/**
 * SPEC-141 FR-27 and FR-28: an existing conversation's surface chip, which names its scope. It is
 * never dismissable. Where the conversation can be raised, it opens a menu of the wider levels.
 */
export function ConversationScopeChip({ channel, parallelMember, control }: ConversationScopeChipProps) {
  const { t } = useI18n();
  const scope = readProductScope(channel);
  const product = productScopeLabel(scope, t);
  const levels = control ? productScopeRaiseMenuLevels({ channel, parallelMember }) : [];
  const interactive = levels.length > 0;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<{ view: ProductScopeRaiseView; target: ProductScope } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // One read at a time, locked in the handler and not only on the button.
  const readRef = useRef<AbortController | null>(null);

  useEffect(() => () => readRef.current?.abort(), []);
  // Another conversation in the same view starts closed.
  useEffect(() => {
    readRef.current?.abort();
    readRef.current = null;
    setOpen(false);
    setLoading(false);
    setDialog(null);
  }, [channel.id, interactive]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!control || levels.length === 0) {
    return <ComposerSurfaceChip surface={scope} title={t(messageKeys.sharedProductScopeRaiseChipTitleFixed, { product })} />;
  }
  const raiseControl = control;
  const pending = raiseControl.pendingChannelId !== null;
  const busy = pending || loading;

  async function chooseLevel(target: ProductScope): Promise<void> {
    setOpen(false);
    if (readRef.current || raiseControl.pendingChannelId !== null) return;
    const controller = new AbortController();
    readRef.current = controller;
    setLoading(true);
    try {
      const view = await fetchProductScopeRaise(channel.id, controller.signal);
      if (controller.signal.aborted) return;
      if (!view.canRaise) {
        raiseControl.report(describeProductScopeRaiseRefusal(view.refusal, t));
      } else if (!view.widerLevels.includes(target)) {
        raiseControl.report(describeProductScopeRaiseRefusal('not_wider', t));
      } else {
        setDialog({ view, target });
      }
    } catch (error) {
      if (!controller.signal.aborted) raiseControl.report(describeProductScopeReadFailure(error, t));
    } finally {
      if (readRef.current === controller) {
        readRef.current = null;
        setLoading(false);
      }
    }
  }

  function confirm(): void {
    if (!dialog || raiseControl.pendingChannelId !== null) return;
    const { view, target } = dialog;
    setDialog(null);
    void raiseControl.raise(channel.id, target, view.revision);
  }

  return (
    <div className="composerSelectChipWrapper conversationScopeChipWrapper" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`composerSurfaceChip composerSurfaceChip${capitalize(scope)} conversationScopeChip`}
        disabled={busy}
        aria-busy={busy || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        title={busy
          ? t(messageKeys.sharedProductScopeRaisePending)
          : t(messageKeys.sharedProductScopeRaiseChipTitle, { product })}
        onClick={() => setOpen((current) => !current)}
      >
        {renderSurfaceIcon(scope)}
        <span>{product}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
      {open && !busy ? (
        <div className="composerSelectChipMenu" role="menu" aria-label={t(messageKeys.sharedProductScopeRaiseMenuAria)}>
          {levels.map((level) => (
            <button
              key={level}
              type="button"
              role="menuitem"
              className="composerSelectChipMenuItem"
              onClick={() => { void chooseLevel(level); }}
            >
              <span className="composerSelectChipMenuItemCheck" aria-hidden="true">{renderSurfaceIcon(level)}</span>
              <span>{t(messageKeys.sharedProductScopeRaiseMenuItem, { product: productScopeLabel(level, t) })}</span>
            </button>
          ))}
        </div>
      ) : null}
      {dialog ? (
        <ProductScopeRaiseDialog
          view={dialog.view}
          target={dialog.target}
          onCancel={() => setDialog(null)}
          onConfirm={confirm}
          // The menu item that opened it is gone, so focus returns to the chip.
          returnFocus={() => buttonRef.current?.focus()}
        />
      ) : null}
    </div>
  );
}

/** FR-29: the confirmation, from the read route's answer, with Cancel focused first. */
export function ProductScopeRaiseDialog({ view, target, onCancel, onConfirm, returnFocus }: {
  view: ProductScopeRaiseView;
  target: ProductScope;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocus?: () => void;
}) {
  const { t } = useI18n();
  const content = buildProductScopeRaiseConfirmation(view, target, t);
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      if (returnFocusRef.current) returnFocusRef.current(); else previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
      if (event.key === 'Tab') {
        const controls = containerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        // Focus that left the dialog, such as a click on its text, comes back into it.
        if (!containerRef.current?.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
          return;
        }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  // The composer sits in a size container, which would hold a fixed overlay inside it.
  return createPortal(
    <div className="confirmOverlay" onClick={onCancel}>
      <div ref={containerRef} className="confirmDialog productScopeRaiseDialog" role="dialog" aria-modal="true"
        aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <p id={titleId} className="confirmTitle">{content.title}</p>
        <section className="productScopeRaiseSection">
          <h3>{t(messageKeys.sharedProductScopeRaiseAddsHeading)}</h3>
          <ul>{content.adds.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <section className="productScopeRaiseSection">
          <h3>{t(messageKeys.sharedProductScopeRaiseParticipantsHeading)}</h3>
          <p>{content.participants}</p>
        </section>
        <section className="productScopeRaiseSection">
          <h3>{t(messageKeys.sharedProductScopeRaiseUnchangedHeading)}</h3>
          <ul>{content.unchanged.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
        <p className="confirmMessage">{content.moves}</p>
        <p className="confirmMessage productScopeRaisePermanent">{content.permanent}</p>
        <div className="confirmActions">
          <button ref={cancelRef} className="confirmCancelButton" type="button" onClick={onCancel}>
            {t(messageKeys.sharedCommonCancel)}
          </button>
          <button className="confirmPrimaryButton" type="button" onClick={onConfirm}>
            {content.confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
