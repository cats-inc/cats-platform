import { messageKeys } from '../../../../../shared/i18n/index.js';
import { useI18n } from '../../../../../app/renderer/i18n/useI18n.js';
import type { RuntimeSessionPolicy } from '../../../../../shared/runtimeSessionPolicy.js';
import type { ExecutionAccess, ExecutionApproval, SessionExecutionPolicy } from '../../../../../shared/providerInteractions.js';
import './providerInteractions.css';

export function ProviderPolicyEditor({ value, onChange, disabled = false }: {
  value: RuntimeSessionPolicy; onChange(value: RuntimeSessionPolicy): void; disabled?: boolean;
}) {
  const { t } = useI18n();
  const p = value.executionPolicy;
  const mode = p?.mode ?? 'legacy';
  const access = p?.mode === 'provider' ? p.constraints.maxAccess : p?.access ?? (value.workspaceAccess === 'read_only' ? 'read-only' : 'workspace-write');
  const network = p?.mode === 'provider' ? p.constraints.network : p?.network ?? false;
  const approval = p?.mode === 'explicit' ? p.approval : 'on-request';
  const limited = value.permissionMode === 'whitelist';
  function update(next: { mode?: typeof mode; access?: ExecutionAccess; network?: boolean; approval?: ExecutionApproval }) {
    const m = next.mode ?? mode, a = next.access ?? access;
    const n = next.network ?? network;
    const policy: SessionExecutionPolicy | undefined = m === 'legacy' ? undefined : m === 'provider'
      ? { version: 1, mode: m, constraints: { maxAccess: a, network: n } }
      : { version: 1, mode: m, access: a, network: a === 'full-access' ? true : a === 'read-only' ? false : n, approval: next.approval ?? approval };
    onChange({ ...value, executionPolicy: policy });
  }
  return <div className="native-provider-policy">
    <label>{t(messageKeys.providerControlsExecutionPolicy)}<select disabled={disabled || limited} value={mode} onChange={e => update({ mode: e.target.value as typeof mode })}>
      <option value="legacy">{t(messageKeys.providerControlsLegacyMode)}</option><option value="provider">{t(messageKeys.providerControlsProviderMode)}</option><option value="explicit">{t(messageKeys.providerControlsExplicitMode)}</option>
    </select></label>
    {limited && <p>{t(messageKeys.providerControlsAllowlist)}</p>}
    {mode === 'legacy' ? <p>{t(messageKeys.providerControlsLegacyHelp)}</p> : <>
      <label>{t(mode === 'provider' ? messageKeys.providerControlsMaximumAccess : messageKeys.providerControlsLocalAccess)}<select disabled={disabled} value={access} onChange={e => update({ access: e.target.value as ExecutionAccess })}>
        <option value="read-only">{t(messageKeys.providerControlsReadOnly)}</option>
        {value.workspaceAccess !== 'read_only' && <><option value="workspace-write">{t(messageKeys.providerControlsWorkspaceWrite)}</option><option value="full-access">{t(messageKeys.providerControlsFullAccess)}</option></>}
      </select></label>
      <label><span><input type="checkbox" checked={network} disabled={disabled || mode === 'explicit' && access !== 'workspace-write'} onChange={e => update({ network: e.target.checked })} /> {t(messageKeys.providerControlsNetwork)}</span></label>
      {mode === 'explicit' && <label>{t(messageKeys.providerControlsApproval)}<select disabled={disabled} value={approval} onChange={e => update({ approval: e.target.value as ExecutionApproval })}>
        <option value="on-request">{t(messageKeys.providerControlsOnRequest)}</option><option value="untrusted">{t(messageKeys.providerControlsUntrusted)}</option><option value="never">{t(messageKeys.providerControlsNever)}</option>
      </select></label>}
      <p>{t(messageKeys.providerControlsPolicyHelp)}</p>
    </>}
  </div>;
}
