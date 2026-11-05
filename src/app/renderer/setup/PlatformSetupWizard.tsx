import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  mountSetupChrome,
  type SetupChrome,
  type SetupFailureReason,
  type SetupStepItem,
} from '../../../../packages/provider-setup/setupChrome.js';
import { SETUP_CAT_HEAD, SETUP_WIZARD_CSS } from '../../../../packages/provider-setup/setupWizardStyles.js';
import { ProviderModelFields, ProviderPickerLoading } from '../../../design/components/ProviderModelFields.js';
import { useProviderRegistryState } from '../../../design/components/useProviderRegistryState.js';
import type { ProductProviderRegistryReadModel } from '../../../shared/providerCatalog.js';
import type { PlatformHostEnvelope } from '../../../shared/platform-contract';
import { PRODUCT_PROVIDER_ORDER } from '../../../shared/providerCatalogData.js';
import type { ProviderModelSelection } from '../../../shared/providerSelection.js';
import { resolveDesktopHostBridge } from '../../../shared/desktopRecoveryBridge.js';
import { messageKeys } from '../../../shared/i18n/messageKeys.js';
import { resolveClientGuideCatName } from '../../../shared/guideCatIdentity.js';
import { useI18n } from '../i18n/index.js';
import { fetchProviderRegistry } from '../providerPickerReads.js';
import { useDesktopGoogleAuth } from '../auth/useDesktopGoogleAuth.js';
import { resolveDefaultDesktopPreferences } from '../settings/settingsDesktopPreferences.js';
import { completePlatformSetup, markPlatformSetupOpened, PlatformSetupApiError } from './api';
import { syncDesktopHostPlatformShell } from './desktopHostBridge.js';
import { nextSetupStep, previousSetupStep, type SetupStep } from './flow';
import { canContinueGuideCatSetupStep } from './plugins';

type SubmitError = 'already' | 'bad' | 'server' | 'network' | 'google' | 'codex';
type AdminMethod = 'local_password' | 'google';

interface WizardRow {
  kind?: string;
  status?: string | null;
}
interface WizardMemory {
  lang?: string;
  skipped?: number[];
  rows?: Record<string, WizardRow>;
  conn?: { ollama?: { state?: string }; openclaw?: { state?: string } };
  ollama?: { models?: string[] };
  priorChanges?: number;
}
interface GuideToolRow {
  id: string;
  label: string;
  usable: boolean;
  state: string | null;
  warn: boolean;
  fixPage: 2 | 3 | null;
  fixLabel: string | null;
}

const ACCOUNT_DRAFT_KEY = 'cats-setup-account';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;

/** Name and email survive a trip back to the host's pages. A password never leaves memory. */
function readAccountDraft(): { name: string; email: string; method: AdminMethod } {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(ACCOUNT_DRAFT_KEY) ?? '{}') as Record<string, unknown>;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      method: parsed.method === 'google' ? 'google' : 'local_password',
    };
  } catch {
    return { name: '', email: '', method: 'local_password' };
  }
}

function codePoints(text: string): number {
  return [...text].length;
}

/** Mounted with page 5, so nothing reads the registry before someone gets there. */
function ProviderRegistryWatcher({ onChange }: {
  onChange: (value: { registry: ProductProviderRegistryReadModel; loading: boolean }) => void;
}) {
  const { providerRegistry, providersLoading } = useProviderRegistryState({ fetchProviderRegistry });
  useEffect(() => { onChange({ registry: providerRegistry, loading: providersLoading }); },
    [onChange, providerRegistry, providersLoading]);
  return null;
}

export function shouldPrefetchGuideCatProviderRegistry(input: {
  step: SetupStep;
  createGuideCat: boolean;
}): boolean {
  return input.step === 2 && input.createGuideCat;
}

export function PlatformSetupWizard({
  envelope,
  onComplete,
}: {
  envelope: PlatformHostEnvelope;
  onComplete: (envelope: PlatformHostEnvelope) => void;
}) {
  const { t, locale, setLanguagePreference } = useI18n();
  const host = useMemo(() => resolveDesktopHostBridge(), []);
  const wizard = host?.setupWizard ?? null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [chrome, setChrome] = useState<SetupChrome | null>(null);
  const chromeRef = useRef<SetupChrome | null>(null);

  const [step, setStep] = useState<SetupStep>(1);
  const draft = useMemo(readAccountDraft, []);
  const [ownerName, setOwnerName] = useState(draft.name);
  const [adminIdentifier, setAdminIdentifier] = useState(draft.email);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminMethod, setAdminMethod] = useState<AdminMethod>(draft.method);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverPasswordError, setServerPasswordError] = useState<string | null>(null);
  const [googleTransactionId, setGoogleTransactionId] = useState<string | null>(null);
  const [fallbackAttemptId] = useState(() => globalThis.crypto.randomUUID());
  const nativeGoogle = useDesktopGoogleAuth();

  const [createGuideCat, setCreateGuideCat] = useState(false);
  const [guideChoiceMade, setGuideChoiceMade] = useState(false);
  const [provider, setProvider] = useState('');
  const [instance, setInstance] = useState('');
  const [model, setModel] = useState('');
  const [modelSelection, setModelSelection] = useState<ProviderModelSelection | null>(null);
  const [modelLabel, setModelLabel] = useState('');
  const [startAtLogin, setStartAtLogin] = useState(true);
  const [memory, setMemory] = useState<WizardMemory | null>(null);
  const submitTicket = useRef(0);
  const submitContext = useRef({ provider, instance, createGuideCat, step });
  submitContext.current = { provider, instance, createGuideCat, step };
  useEffect(() => () => { submitTicket.current++; }, []);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [toolLabels, setToolLabels] = useState<Record<string, string>>({});

  const [creating, setCreating] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [submitDetail, setSubmitDetail] = useState<string | null>(null);
  const [changesMade, setChangesMade] = useState(0);
  const setupOpenedRecorded = useRef(false);
  const attemptId = envelope.bootstrapAttemptId ?? fallbackAttemptId;
  const guideCatName = resolveClientGuideCatName();

  /* ---------- The chrome: the same rail, log and details page as the host's pages ---------- */

  const goToHostPage = useCallback((page: number) => {
    submitTicket.current++;
    try {
      globalThis.sessionStorage?.setItem(ACCOUNT_DRAFT_KEY, JSON.stringify({
        name: ownerNameRef.current, email: emailRef.current, method: methodRef.current,
      }));
    } catch { /* The form is only asked for again. */ }
    void wizard?.returnToPage(page);
  }, [wizard]);
  const ownerNameRef = useRef(ownerName);
  const emailRef = useRef(adminIdentifier);
  const methodRef = useRef(adminMethod);
  ownerNameRef.current = ownerName;
  emailRef.current = adminIdentifier;
  methodRef.current = adminMethod;

  const stepHandler = useRef<(page: number) => void>(() => undefined);
  stepHandler.current = (page) => {
    if (page === 4) setStep(1);
    else if (page < 4) goToHostPage(page);
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const mounted = mountSetupChrome(root, wizard ? host : null, {
      locale,
      css: SETUP_WIZARD_CSS,
      catHead: SETUP_CAT_HEAD,
      browserOnly: !wizard,
      isBusy: () => creatingRef.current,
      onStep: (page) => stepHandler.current(page),
      onRun: () => setChangesMade(mounted.logTotals().changes),
    });
    chromeRef.current = mounted;
    setChrome(mounted);
    return () => {
      chromeRef.current = null;
      mounted.destroy();
      setChrome(null);
    };
    // Mounted once: its language and steps are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const creatingRef = useRef(false);
  creatingRef.current = creating;

  useEffect(() => { chrome?.setLocale(locale); }, [chrome, locale]);

  useEffect(() => {
    if (!wizard) return;
    let cancelled = false;
    void Promise.resolve(wizard.facts()).then((facts) => {
      if (cancelled) return;
      const state = ((facts as { state?: WizardMemory | null }).state ?? null);
      setMemory(state);
      chromeRef.current?.setPriorChanges(state?.priorChanges ?? 0);
      if (chromeRef.current) setChangesMade(chromeRef.current.logTotals().changes);
      if (state?.lang && state.lang !== locale) setLanguagePreference(state.lang === 'zh-TW' ? 'zh-TW' : 'en');
    }).catch(() => undefined);
    void Promise.resolve(host?.getProviderSetup?.('settings')).then((snapshot) => {
      if (cancelled || !snapshot) return;
      setSelectedIds(snapshot.runtime.selection.targets.map((target) => target.provider));
      setToolLabels(Object.fromEntries((snapshot.runtime.universe ?? []).map((entry) => [entry.provider, entry.familyLabel])));
    }).catch(() => undefined);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard, host]);

  useEffect(() => {
    if (setupOpenedRecorded.current) return;
    setupOpenedRecorded.current = true;
    void markPlatformSetupOpened(attemptId, {
      fallbackMessageForStatus: (status) => t(messageKeys.setupWizardRecordOpenFailedWithStatus, { status }),
    }).catch(() => undefined);
  }, [attemptId, t]);

  /* ---------- Page 5's tools ---------- */

  const [registryState, setRegistryState] = useState<{ registry: ProductProviderRegistryReadModel; loading: boolean }>(
    { registry: { state: 'runtime_unreachable', providers: [] }, loading: true },
  );
  const providerRegistry = registryState.registry;
  const providers = providerRegistry.providers;
  // SPEC-013: an unreachable Runtime is not reported here. It recovers by itself, with a spinner.
  const providersLoading = registryState.loading || providerRegistry.state === 'runtime_unreachable';

  const toolRows = useMemo<GuideToolRow[]>(() => {
    const usable = new Map(providers.map((option) => [option.id as string, option.label]));
    const ids = [...new Set([...usable.keys(), ...selectedIds])];
    const order = PRODUCT_PROVIDER_ORDER as readonly string[];
    ids.sort((left, right) => order.indexOf(left) - order.indexOf(right));
    const rows = memory?.rows ?? {};
    return ids.map((id) => {
      const label = usable.get(id) ?? toolLabels[id] ?? id;
      if (usable.has(id)) {
        const status = rows[id]?.status;
        const state = !wizard ? null
          : status === 'auth_required' ? t(messageKeys.setupWizardToolNotSignedIn)
            : id === 'claude' && status === 'ready' ? t(messageKeys.setupWizardToolSignedIn)
              : t(messageKeys.setupWizardToolCannotTell);
        return { id, label, usable: true, state, warn: status === 'auth_required', fixPage: null, fixLabel: null };
      }
      if (id === 'ollama') {
        const ready = rows.ollama?.kind === 'ready';
        return {
          id, label, usable: false, warn: false,
          state: t(ready ? messageKeys.setupWizardToolNoModels : messageKeys.setupWizardToolServiceDown),
          fixPage: ready ? 3 : 2,
          fixLabel: t(ready ? messageKeys.setupWizardToolDownloadOne : messageKeys.setupWizardToolFix),
        };
      }
      if (id === 'openclaw') {
        return {
          id, label, usable: false, warn: false,
          state: t(memory?.conn?.openclaw?.state === 'connected'
            ? messageKeys.setupWizardToolNoGatewayModels : messageKeys.setupWizardToolNotConnected),
          fixPage: 2, fixLabel: t(messageKeys.setupWizardToolFix),
        };
      }
      return {
        id, label, usable: false, warn: false, state: t(messageKeys.setupWizardToolNotInstalled),
        fixPage: 2, fixLabel: t(messageKeys.setupWizardToolFix),
      };
    });
  }, [memory, providers, selectedIds, t, toolLabels, wizard]);
  const usableTools = useMemo(() => toolRows.filter((row) => row.usable), [toolRows]);

  // First arrival: on when something can answer, off otherwise, and one choice chooses itself.
  useEffect(() => {
    if (step !== 2 || guideChoiceMade || providersLoading) return;
    setCreateGuideCat(usableTools.length > 0);
    if (usableTools.length === 1 && !provider) setProvider(usableTools[0]!.id);
    if (providerRegistry.state === 'ready' || providerRegistry.state === 'no_usable_targets') setGuideChoiceMade(true);
  }, [guideChoiceMade, provider, providerRegistry.state, providersLoading, step, usableTools]);

  function chooseTool(id: string): void {
    setProvider(id);
    setInstance('');
    setModel('');
    setModelSelection(null);
    setModelLabel('');
  }

  const toolLabel = toolRows.find((row) => row.id === provider)?.label ?? provider;
  const chosenTool = toolRows.find((row) => row.id === provider) ?? null;

  /* ---------- Account ---------- */

  const accountProblems = useMemo(() => {
    const problems: Record<string, string> = {};
    if (!ownerName.trim()) problems.name = t(messageKeys.setupWizardNameRequired);
    if (adminMethod === 'google') {
      if (!googleTransactionId) problems.google = t(messageKeys.setupWizardGoogleRequired);
      return problems;
    }
    if (!EMAIL.test(adminIdentifier.trim())) problems.email = t(messageKeys.setupWizardEmailRequired);
    const length = codePoints(adminPassword);
    if (length < PASSWORD_MIN) problems.password = t(messageKeys.setupWizardPasswordTooShort, { count: length });
    else if (length > PASSWORD_MAX) problems.password = t(messageKeys.setupWizardPasswordTooLong);
    else if (serverPasswordError) problems.password = serverPasswordError;
    return problems;
  }, [adminIdentifier, adminMethod, adminPassword, googleTransactionId, ownerName, serverPasswordError, t]);
  const shownProblem = (key: string): string | null => (touched[key] && accountProblems[key] ? accountProblems[key]! : null);
  const touch = (key: string) => setTouched((current) => ({ ...current, [key]: true }));

  function goToCatlas(): void {
    setTouched({ name: true, email: true, password: true, google: true });
    if (Object.keys(accountProblems).length) {
      const first = ['name', 'email', 'password', 'google'].find((key) => accountProblems[key]);
      globalThis.document?.getElementById(`setup-acct-${first}`)?.focus();
      return;
    }
    setStep(nextSetupStep(step));
  }

  async function verifyGoogle(): Promise<void> {
    setGoogleTransactionId(null);
    try { setGoogleTransactionId(await nativeGoogle.begin({ purpose: 'bootstrap', attemptId })); }
    catch { setTouched((current) => ({ ...current, google: true })); }
  }

  /* ---------- The final button ---------- */

  const canCreate = guideChoiceMade && canContinueGuideCatSetupStep({ createGuideCat, model }) && (!createGuideCat || Boolean(provider));

  const finishSetup = useCallback(async (): Promise<void> => {
    const mine = ++submitTicket.current;
    const context = JSON.stringify(submitContext.current);
    const current = () => mine === submitTicket.current && JSON.stringify(submitContext.current) === context;
    chrome?.beginWork();
    setCreating(true);
    setSubmitError(null);
    setSubmitDetail(null);
    // The password stays out of the log: this names the request and nothing typed.
    const runBody = adminMethod === 'google'
      ? '{"adminMethod":"google"}'
      : `{"adminIdentifier":${JSON.stringify(adminIdentifier.trim())},"adminPassword":"(not logged)"}`;
    let run: number | null = null;
    const finishRun = (status: string, error?: string) => {
      if (run !== null) {
        void Promise.resolve(wizard?.finishRun(run, { status, ...(error ? { error } : {}), ...(status === 'ready' ? { applied: ['created the first admin'] } : {}) })).catch(() => undefined);
      }
    };
    try {
      if (wizard && createGuideCat && provider === 'codex') {
        // Fresh host evidence for this exact target on every attempt. Nothing is posted yet.
        const readiness = await Promise.resolve().then(() => wizard.checkCodexInitialization(instance || undefined)).catch(() => ({ status: 'unavailable' }));
        if (!current()) return;
        if (readiness.status !== 'ready' && readiness.status !== 'not_applicable') {
          setSubmitError('codex');
          setSubmitDetail(readiness.status);
          return;
        }
      }
      if (!current()) return;
      run = wizard
        ? await Promise.resolve(wizard.startRun({ command: `POST /api/platform/setup/complete ${runBody}` })).catch(() => null)
        : null;
      if (!current()) return;
      const result = await completePlatformSetup({
        attemptId,
        ownerDisplayName: ownerName.trim(),
        ...(adminMethod === 'google' ? { adminMethod: 'google' as const } : {
          adminIdentifier: adminIdentifier.trim(), adminPassword,
        }),
        createGuideCat,
        guideCatProvider: createGuideCat ? provider : undefined,
        guideCatInstance: createGuideCat ? (instance || undefined) : undefined,
        guideCatModel: createGuideCat ? (model || undefined) : undefined,
        guideCatModelSelection: createGuideCat ? modelSelection : undefined,
      }, {
        fallbackMessageForStatus: (status) => t(messageKeys.setupWizardFailedWithStatus, { status }),
        errorMessagesByCode: {
          already_complete: t(messageKeys.setupWizardAlreadyCompleteError),
          bad_request: t(messageKeys.setupWizardInvalidRequestError),
          invalid_admin_credentials: t(messageKeys.setupWizardCredentialsRefused),
          configuration_error: t(messageKeys.setupWizardServerError),
          internal_error: t(messageKeys.setupWizardServerError),
        },
      }, adminMethod === 'google' ? googleTransactionId ?? undefined : undefined);
      finishRun('ready');
      try { globalThis.sessionStorage?.removeItem(ACCOUNT_DRAFT_KEY); } catch { /* It only held a name and email. */ }
      // Start at login takes effect only now: the host registers nothing during a first run.
      if (wizard && host?.updateDesktopPreferences) {
        const current = envelope.desktop ?? resolveDefaultDesktopPreferences();
        await host.updateDesktopPreferences({
          startAtLogin, openWindowOnStartup: current.openWindowOnStartup, systemTrayEnabled: current.systemTrayEnabled,
        }).catch(() => undefined);
      }
      await syncDesktopHostPlatformShell(result);
      onComplete(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error instanceof PlatformSetupApiError ? error.code : null;
      const status = error instanceof PlatformSetupApiError ? error.status : null;
      finishRun('failed', code ? `${status} ${code}` : message);
      setSubmitDetail(code ? `${status} ${code}` : message);
      if (code === 'invalid_admin_credentials') {
        setServerPasswordError(message);
        setTouched((current) => ({ ...current, password: true }));
        setStep(1);
        globalThis.setTimeout(() => globalThis.document?.getElementById('setup-acct-password')?.focus(), 0);
      } else if (code === 'already_complete') {
        setSubmitError('already');
      } else if (adminMethod === 'google' && (status === 401 || status === 403 || /google/iu.test(code ?? ''))) {
        setGoogleTransactionId(null);
        setSubmitError('google');
      } else if (code === 'bad_request') {
        setSubmitError('bad');
      } else if (error instanceof PlatformSetupApiError) {
        setSubmitError('server');
      } else {
        setSubmitError('network');
      }
    } finally {
      setCreating(false);
    }
  }, [adminIdentifier, adminMethod, adminPassword, attemptId, chrome, createGuideCat, envelope.desktop, googleTransactionId, host, instance,
    model, modelSelection, onComplete, ownerName, provider, startAtLogin, t, wizard]);

  function submitReason(): SetupFailureReason {
    const retry = { label: t(messageKeys.setupWizardTryAgain), run: () => { void finishSetup(); } };
    switch (submitError) {
      case 'codex':
        return { title: t(messageKeys.setupWizardCodexTitle), body: t(messageKeys.setupWizardCodexBody), raw: submitDetail,
          severity: 'warning', repair: { label: t(messageKeys.setupWizardCodexFix), run: () => goToHostPage(3) } };
      case 'already':
        return { title: t(messageKeys.setupWizardAlreadyTitle), body: t(messageKeys.setupWizardAlreadyBody), raw: submitDetail, severity: 'error',
          repair: { label: t(messageKeys.setupWizardGoToSignIn), run: () => globalThis.location?.assign('/') } };
      case 'bad':
        return { title: t(messageKeys.setupWizardRefusedTitle), body: t(messageKeys.setupWizardRefusedBody), raw: submitDetail, severity: 'error', repair: retry };
      case 'network':
        return { title: t(messageKeys.setupWizardNoAnswerTitle), body: t(messageKeys.setupWizardNoAnswerBody), raw: submitDetail, severity: 'error', repair: retry };
      case 'google':
        return { title: t(messageKeys.setupWizardGoogleExpiredTitle), body: t(messageKeys.setupWizardGoogleExpiredBody), raw: submitDetail, severity: 'warning',
          repair: { label: t(messageKeys.setupWizardVerifyAgain), run: () => { void verifyGoogle(); } } };
      default:
        return { title: t(messageKeys.setupWizardServerTitle), body: t(messageKeys.setupWizardServerBody), raw: submitDetail, severity: 'error', repair: retry };
    }
  }

  /* ---------- Rail ---------- */

  useEffect(() => {
    if (!chrome) return;
    const all: SetupStepItem[] = [
      { n: 1, title: t(messageKeys.setupWizardRailTools), note: t(messageKeys.setupWizardRailToolsNote), state: 'done' },
      { n: 2, title: t(messageKeys.setupWizardRailComputer), note: t(messageKeys.setupWizardRailComputerNote), state: 'done' },
      { n: 3, title: t(selectedIds.includes('ollama') ? messageKeys.setupWizardRailSignInModels : messageKeys.setupWizardRailSignIn), note: t(messageKeys.setupWizardRailSignInNote), state: 'done' },
      { n: 4, title: t(messageKeys.setupWizardRailAccount), note: t(messageKeys.setupWizardRailAccountNote), state: step === 1 ? 'current' : 'done' },
      { n: 5, title: t(messageKeys.setupWizardRailCatlas), note: t(messageKeys.setupWizardRailCatlasNote), state: step === 2 ? 'current' : 'future' },
    ];
    const skipped = new Set(memory?.skipped ?? []);
    const steps = (wizard ? all : all.slice(3)).map((item) => ({
      ...item,
      skipped: skipped.has(item.n),
      enabled: item.state === 'done' && !skipped.has(item.n) && !creating,
    }));
    chrome.setSteps(steps);
    chrome.setNote(guideCatName, step === 2 && !createGuideCat
      ? t(messageKeys.setupWizardNoteOff)
      : step === 2 && toolLabel ? toolLabel
        : selectedIds.length ? t(messageKeys.setupWizardNoteChosen, { count: selectedIds.length }) : t(messageKeys.setupWizardNoteNoTools));
    chrome.setBusy(creating);
  }, [chrome, createGuideCat, creating, guideCatName, memory, selectedIds, step, t, toolLabel, wizard]);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!chrome) return;
    chrome.pane.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [chrome, step]);

  /* ---------- Pages ---------- */

  function detailsButton(id: string, reason: () => SetupFailureReason) {
    if (!wizard) return null;
    return (
      <button type="button" className="more" id={id}
        onClick={(event) => chrome?.openDetails(reason(), event.currentTarget)}>
        {t(messageKeys.setupWizardShowDetails)}
      </button>
    );
  }

  function field(key: string, rest: string | null) {
    const problem = shownProblem(key);
    return <small id={`setup-msg-${key}`} className={problem ? 'bad' : ''} role={problem ? 'alert' : undefined}>{problem ?? rest}</small>;
  }

  const accountPage = (
    <div className="form">
      <div>
        <h1 ref={step === 1 ? headingRef : undefined} tabIndex={-1}>{t(messageKeys.setupWizardAccountTitle)}</h1>
        <p className="lead" style={{ marginBottom: 0 }}>
          {t(wizard ? messageKeys.setupWizardWelcomeIntroDesktop : messageKeys.setupWizardAccountIntro)}
        </p>
      </div>
      <div className="field">
        <label htmlFor="setup-acct-name">{t(messageKeys.setupWizardOwnerNameLabel)}</label>
        <input className="input" id="setup-acct-name" autoComplete="name" value={ownerName}
          placeholder={t(messageKeys.setupWizardOwnerNamePlaceholder)} aria-invalid={Boolean(shownProblem('name'))}
          onChange={(event) => setOwnerName(event.target.value)} onBlur={() => touch('name')} />
        {field('name', null)}
      </div>
      {nativeGoogle.supported ? (
        <div className="field">
          <span className="label">{t(messageKeys.setupWizardMethodLabel)}</span>
          <div className="seg" role="radiogroup" aria-label={t(messageKeys.setupWizardMethodLabel)}>
            <label>
              <input type="radio" name="setup-method" checked={adminMethod === 'local_password'} disabled={nativeGoogle.busy}
                onChange={() => { setAdminMethod('local_password'); setGoogleTransactionId(null); void nativeGoogle.cancel(); }} />
              <span><strong>{t(messageKeys.setupWizardPasswordMethod)}</strong><small>{t(messageKeys.setupWizardPasswordMethodNote)}</small></span>
            </label>
            <label>
              <input type="radio" name="setup-method" checked={adminMethod === 'google'} disabled={nativeGoogle.busy}
                onChange={() => setAdminMethod('google')} />
              <span><strong>{t(messageKeys.setupWizardGoogleMethod)}</strong>
                <small>{t(nativeGoogle.available ? messageKeys.setupWizardGoogleMethodNote : messageKeys.authNativeUnavailable)}</small></span>
            </label>
          </div>
        </div>
      ) : null}
      {adminMethod === 'google' ? (
        <div className="field">
          <span className="label">{t(messageKeys.setupWizardGoogleMethod)}</span>
          <small className={googleTransactionId ? '' : shownProblem('google') ? 'bad' : ''} role={shownProblem('google') ? 'alert' : undefined}>
            {googleTransactionId
              ? t(messageKeys.authNativeVerified)
              : shownProblem('google') ?? (nativeGoogle.available ? t(messageKeys.settingsAccountPasswordOptional) : t(messageKeys.authNativeUnavailable))}
          </small>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {!googleTransactionId ? (
              <button type="button" className="btn" id="setup-acct-google"
                disabled={!nativeGoogle.available || nativeGoogle.busy} onClick={() => void verifyGoogle()}>
                {nativeGoogle.busy ? t(messageKeys.authNativeWaiting) : t(messageKeys.authNativeContinue)}
              </button>
            ) : null}
            {nativeGoogle.busy || googleTransactionId ? (
              <button type="button" className="btn" disabled={nativeGoogle.snapshot?.committing}
                onClick={() => { setGoogleTransactionId(null); void nativeGoogle.cancel(); }}>
                {t(messageKeys.authNativeCancel)}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="setup-acct-email">{t(messageKeys.setupWizardAdminIdentifierLabel)}</label>
            <input className="input" id="setup-acct-email" type="email" autoComplete="username" spellCheck={false}
              placeholder={t(messageKeys.setupWizardAdminIdentifierPlaceholder)} value={adminIdentifier}
              aria-invalid={Boolean(shownProblem('email'))}
              onChange={(event) => setAdminIdentifier(event.target.value)} onBlur={() => touch('email')} />
            {field('email', null)}
          </div>
          <div className="field">
            <label htmlFor="setup-acct-password">{t(messageKeys.setupWizardAdminPasswordLabel)}</label>
            <div className="pw">
              <input className="input" id="setup-acct-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                value={adminPassword} aria-invalid={Boolean(shownProblem('password'))}
                onChange={(event) => { setAdminPassword(event.target.value); setServerPasswordError(null); }} onBlur={() => touch('password')} />
              <button type="button" className="more" onClick={() => setShowPassword((value) => !value)}>
                {t(showPassword ? messageKeys.setupWizardPasswordHide : messageKeys.setupWizardPasswordShow)}
              </button>
            </div>
            {field('password', t(messageKeys.setupWizardPasswordHint))}
          </div>
        </>
      )}
    </div>
  );

  const submitAlert = submitError ? (() => {
    const reason = submitReason();
    return (
      <div className={`alert ${submitError === 'google' ? 'warn' : ''}`} role="alert">
        <div className="alert-text"><strong>{reason.title}</strong><span>{reason.body}</span></div>
        <div className="alert-actions">
          {detailsButton('setup-details-submit', submitReason)}
          {submitError === 'codex' ? (
            <button type="button" className="btn small" id="setup-fix-codex" onClick={() => goToHostPage(3)}>
              {t(messageKeys.setupWizardCodexFix)}
            </button>
          ) : submitError === 'already' ? (
            <button type="button" className="btn small" id="setup-to-sign-in" onClick={() => globalThis.location?.assign('/')}>
              {t(messageKeys.setupWizardGoToSignIn)}
            </button>
          ) : submitError === 'google' ? (
            <button type="button" className="btn small" id="setup-google-again" disabled={nativeGoogle.busy} onClick={() => void verifyGoogle()}>
              {nativeGoogle.busy ? t(messageKeys.authNativeWaiting) : t(messageKeys.setupWizardVerifyAgain)}
            </button>
          ) : null}
        </div>
      </div>
    );
  })() : null;

  const noUsable = !providersLoading && usableTools.length === 0;
  const summary: string[] = [];
  summary.push(adminMethod === 'google'
    ? t(wizard ? messageKeys.setupWizardSummaryAccountGoogleDesktop : messageKeys.setupWizardSummaryAccountGoogle)
    : t(wizard ? messageKeys.setupWizardSummaryAccountDesktop : messageKeys.setupWizardSummaryAccount, { email: adminIdentifier.trim() }));
  if (createGuideCat && !provider) summary.push(t(messageKeys.setupWizardSummaryCatlasChoose, { guideCatName }));
  else if (createGuideCat) {
    const modelName = modelLabel || model;
    summary.push(t(messageKeys.setupWizardSummaryCatlasOn, {
      guideCatName, tool: modelName ? `${toolLabel}${locale === 'zh-TW' ? '、' : ', '}${modelName}` : toolLabel,
    }));
  }
  else summary.push(t(messageKeys.setupWizardSummaryCatlasOff, { guideCatName }));
  if (wizard && startAtLogin) summary.push(t(messageKeys.setupWizardSummaryStartAtLogin));
  summary.push(t(messageKeys.setupWizardSummaryLobby));

  const catlasPage = (
    <>
      <h1 ref={step === 2 ? headingRef : undefined} tabIndex={-1}>{t(messageKeys.setupWizardCatlasTitle, { guideCatName })}</h1>
      <p className="lead">{t(messageKeys.setupWizardCatlasLead, { guideCatName })}</p>
      {submitAlert}
      <div className="choice-group" role="radiogroup" aria-label={guideCatName}>
        <div className="seg">
          <label>
            <input type="radio" name="setup-guide" id="setup-guide-on" checked={createGuideCat} disabled={noUsable}
              onChange={() => { setCreateGuideCat(true); setGuideChoiceMade(true); }} />
            <span><strong>{t(messageKeys.setupWizardEnableGuideLabel, { guideCatName })}</strong><small>{t(messageKeys.setupWizardEnableGuideNote)}</small></span>
          </label>
          <label>
            <input type="radio" name="setup-guide" id="setup-guide-off" checked={guideChoiceMade && !createGuideCat}
              onChange={() => { setCreateGuideCat(false); setGuideChoiceMade(true); }} />
            <span><strong>{t(messageKeys.setupWizardGuideNotNow)}</strong><small>{t(messageKeys.setupWizardGuideNotNowNote)}</small></span>
          </label>
        </div>
      </div>
      {noUsable ? (
        <div className="alert warn" role="status">
          <div className="alert-text"><strong>{t(messageKeys.setupWizardNoToolTitle, { guideCatName })}</strong><span>{t(messageKeys.setupWizardNoToolBody)}</span></div>
          {wizard ? (
            <div className="alert-actions">
              <button type="button" className="btn small" id="setup-fix-tools" onClick={() => goToHostPage(2)}>{t(messageKeys.setupWizardBackToTools)}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {createGuideCat || (!guideChoiceMade && providersLoading) ? (
        <>
          <p className="group-label">{t(messageKeys.setupWizardWhichTool, { guideCatName })}</p>
          {providersLoading && !toolRows.length ? (
            <ProviderPickerLoading label={t(messageKeys.sharedProviderModelFieldLoadingProviders)} />
          ) : (
            <ul className="rows">
              {toolRows.map((row) => row.usable ? (
                <li className="row" key={row.id} data-row={`guide-${row.id}`}>
                  <div className="row-top">
                    <label>
                      <input type="radio" name="setup-guide-tool" id={`setup-guide-${row.id}`} checked={provider === row.id} onChange={() => chooseTool(row.id)} />
                      <span className="row-text"><strong>{row.label}</strong></span>
                    </label>
                    {row.state ? <span className={`row-state ${row.warn ? 'attn' : ''}`}>{row.state}</span> : null}
                  </div>
                </li>
              ) : (
                <li className="row is-disabled" key={row.id} data-row={`guide-${row.id}`}>
                  <div className="row-top">
                    <div className="row-text"><strong>{row.label}</strong></div>
                    <span className="row-state">{row.state}</span>
                    {wizard && row.fixPage ? (
                      <button type="button" className="more" id={`setup-fix-${row.id}`} onClick={() => goToHostPage(row.fixPage!)}>{row.fixLabel}</button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {chosenTool?.warn ? (
            <p className="footnote" role="status">
              {t(messageKeys.setupWizardToolNeedsSignIn, { tool: chosenTool.label, guideCatName })}{' '}
              <button type="button" className="more" id="setup-fix-sign-in" onClick={() => goToHostPage(3)}>{t(messageKeys.setupWizardGoSignIn)}</button>
            </p>
          ) : null}
          {provider && chosenTool?.usable ? (
            <div className="fields-2 setupGuideFields">
              <ProviderModelFields
                key={provider}
                hideProviderField
                provider={provider}
                instance={instance}
                model={model}
                modelSelection={modelSelection}
                onTargetChange={(target) => {
                  setProvider(target.provider);
                  setInstance(target.instance);
                  setModel(target.model);
                  setModelSelection(target.modelSelection ?? null);
                  setModelLabel(target.executionLabel ?? '');
                }}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {wizard ? (
        <ul className="rows" style={{ marginTop: 12 }}>
          <li className="row is-needs" data-row="start-at-login">
            <div className="row-top">
              <label>
                <input type="checkbox" id="setup-start-at-login" checked={startAtLogin} onChange={(event) => setStartAtLogin(event.target.checked)} />
                <span className="row-text"><strong>{t(messageKeys.setupWizardStartAtLogin)}</strong><span className="p">{t(messageKeys.setupWizardStartAtLoginNote)}</span></span>
              </label>
              <span className="tag">{t(messageKeys.setupWizardStartAtLoginTag)}</span>
            </div>
          </li>
        </ul>
      ) : null}
      <div className="summary">
        <h2>{t(messageKeys.setupWizardSummaryTitle)}</h2>
        <ul>{summary.map((item) => <li key={item}>{item}</li>)}</ul>
        {wizard ? (
          <p className="tail">{changesMade > 0
            ? t(messageKeys.setupWizardChangesMade, { count: changesMade })
            : t(messageKeys.setupWizardNoChangesMade)}</p>
        ) : null}
      </div>
    </>
  );

  const backButton = (onClick: () => void, disabled = false) => (
    <button type="button" className="btn" id="setup-back" disabled={disabled} onClick={onClick}>{t(messageKeys.setupWizardBackButton)}</button>
  );

  const accountFoot = (
    <>
      <p className="hint" />
      {wizard ? backButton(() => goToHostPage(memory?.skipped?.includes(3) ? (memory?.skipped?.includes(2) ? 1 : 2) : 3)) : null}
      <button type="button" className="btn primary setupPrimaryButton" id="setup-next" onClick={goToCatlas}>{t(messageKeys.setupWizardNextButton)}</button>
    </>
  );
  const catlasFoot = (
    <>
      <p className="hint">{createGuideCat && !canCreate ? t(messageKeys.setupWizardChooseToolHint, { guideCatName }) : ''}</p>
      {backButton(() => setStep(previousSetupStep(step)), creating)}
      <button type="button" className="btn primary setupPrimaryButton" id="setup-create"
        disabled={!canCreate || creating || submitError === 'already'} onClick={() => void finishSetup()}>
        {t(creating ? messageKeys.setupWizardCreatingAction : messageKeys.setupWizardCreateAction)}
      </button>
    </>
  );

  return (
    <div ref={rootRef} className="firstRunWizard">
      {step === 2 && (createGuideCat || !guideChoiceMade) ? <ProviderRegistryWatcher onChange={setRegistryState} /> : null}
      {chrome ? createPortal(step === 1 ? accountPage : catlasPage, chrome.pane) : null}
      {chrome ? createPortal(step === 1 ? accountFoot : catlasFoot, chrome.foot) : null}
    </div>
  );
}
