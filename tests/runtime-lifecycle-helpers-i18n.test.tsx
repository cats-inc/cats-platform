import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveHelperActions,
  presentRuntimeLifecycleDetail,
  presentRuntimeLifecycleHelperLabel,
  presentRuntimeLifecycleStatus,
  presentRuntimeLifecycleUnsupportedReason,
} from '../src/app/renderer/settings/runtimeLifecycleHelpers.ts';
import type { RuntimeLifecycleHelperSummary } from '../src/shared/desktopRecoveryBridge.ts';
import { createTranslator } from '../src/shared/i18n/index.ts';

function helper(overrides: Partial<RuntimeLifecycleHelperSummary> = {}): RuntimeLifecycleHelperSummary {
  return {
    id: 'windows-claude-native-installer',
    label: 'Windows native Claude Code installer',
    kind: 'provider_installer',
    pack: 'native_cli_pack',
    platform: 'windows',
    packagedRelativePath: 'desktop/setup-assets/windows/Install-ClaudeCode.ps1',
    supportsCheckOnly: true,
    supportsApply: true,
    supportsUpgrade: true,
    supportsForce: true,
    supportsUninstall: true,
    requiresElevation: false,
    available: true,
    supported: true,
    unsupportedReason: null,
    ...overrides,
  };
}

test('runtime lifecycle helper labels localize known packaged helper patterns', () => {
  const t = createTranslator('zh-TW');

  assert.equal(
    presentRuntimeLifecycleHelperLabel(helper(), t),
    'Windows 原生 Claude Code 安裝器',
  );
  assert.equal(
    presentRuntimeLifecycleHelperLabel(helper({
      id: 'windows-node-host-installer',
      label: 'Windows Node.js LTS host installer',
    }), t),
    'Windows Node.js LTS 主機安裝器',
  );
  assert.equal(
    presentRuntimeLifecycleHelperLabel(helper({
      id: 'linux-codex-native-installer',
      label: 'Linux OpenAI Codex CLI installer',
      platform: 'linux',
    }), t),
    'Linux OpenAI Codex CLI 安裝器',
  );
});

test('runtime lifecycle unavailable action reasons use localized helper labels', () => {
  const t = createTranslator('zh-TW');
  const actions = deriveHelperActions(helper({ available: false }), t);

  assert.equal(
    actions.find((entry) => entry.action === 'install')?.reason,
    'Windows 原生 Claude Code 安裝器 目前未內建於這個主機版本。',
  );
});

test('runtime lifecycle unsupported platform reasons localize deterministic host text', () => {
  const t = createTranslator('zh-TW');
  const unsupportedReason =
    'Windows native Claude Code installer is currently only supported on Linux hosts.';
  const actions = deriveHelperActions(helper({
    supported: false,
    unsupportedReason,
  }), t);

  assert.equal(
    actions.find((entry) => entry.action === 'install')?.reason,
    'Windows 原生 Claude Code 安裝器 目前只支援 Linux 主機。',
  );
  assert.equal(
    presentRuntimeLifecycleUnsupportedReason('raw host failure', t),
    'raw host failure',
  );
});

test('runtime lifecycle status and known manual details localize in zh-TW', () => {
  const t = createTranslator('zh-TW');

  assert.equal(presentRuntimeLifecycleStatus('changes_required', t), '需要變更');
  assert.equal(
    presentRuntimeLifecycleDetail(
      'Start Docker Desktop and wait for the engine to become ready, then rerun the packaged setup check.',
      t,
    ),
    '請啟動 Docker Desktop，等待引擎就緒後重新執行套裝設定檢查。',
  );
});
