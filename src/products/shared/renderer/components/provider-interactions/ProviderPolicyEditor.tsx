import type { RuntimeSessionPolicy } from '../../../../../shared/runtimeSessionPolicy.js';
import type { ExecutionAccess, ExecutionApproval, SessionExecutionPolicy } from '../../../../../shared/providerInteractions.js';
import './providerInteractions.css';

export function ProviderPolicyEditor({ value, onChange, disabled = false }: {
  value: RuntimeSessionPolicy; onChange(value: RuntimeSessionPolicy): void; disabled?: boolean;
}) {
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
    <label>Provider execution policy<select disabled={disabled || limited} value={mode} onChange={e => update({ mode: e.target.value as typeof mode })}>
      <option value="legacy">Keep existing execution behavior</option><option value="provider">Use provider configuration within a limit</option><option value="explicit">Choose access and approval separately</option>
    </select></label>
    {limited && <p>This work uses a tool allowlist. Its execution boundary stays in effect.</p>}
    {mode === 'legacy' ? <p>Existing permission settings are unchanged. “Skip approval” does not imply full machine access.</p> : <>
      <label>{mode === 'provider' ? 'Maximum admitted access' : 'Local file access'}<select disabled={disabled} value={access} onChange={e => update({ access: e.target.value as ExecutionAccess })}>
        <option value="read-only">Read only</option>
        {value.workspaceAccess !== 'read_only' && <><option value="workspace-write">Write in the workspace</option><option value="full-access">Full machine access</option></>}
      </select></label>
      <label><span><input type="checkbox" checked={network} disabled={disabled || mode === 'explicit' && access !== 'workspace-write'} onChange={e => update({ network: e.target.checked })} /> Network access</span></label>
      {mode === 'explicit' && <label>Approval policy<select disabled={disabled} value={approval} onChange={e => update({ approval: e.target.value as ExecutionApproval })}>
        <option value="on-request">Ask when requested by the agent</option><option value="untrusted">Ask for untrusted commands</option><option value="never">Never prompt; enforce the access limit</option>
      </select></label>}
      <p>This choice applies when the new conversation admits its session. Unsupported Runtime/provider targets reject it. Remote MCP tools can have separate access.</p>
    </>}
  </div>;
}
