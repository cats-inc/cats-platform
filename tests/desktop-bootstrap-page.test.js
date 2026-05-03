import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopBootstrapPage } from '../build/desktop/bootstrapPage.js';

test('desktop bootstrap page renders summary-first recovery with collapsed details', () => {
  const html = buildDesktopBootstrapPage();

  // Core structure
  assert.match(html, /id="app"/);
  assert.match(html, /class="app[\s"]/);
  assert.match(html, /class="hero/);

  // Recovery summary card with 3-slot action row
  assert.match(html, /recovery-summary/);
  assert.match(html, /recovery-title/);
  assert.match(html, /recovery-desc/);
  assert.match(html, /recovery-actions/);
  assert.match(html, /RecoverySummaryCard/);

  // Human-friendly copy per state
  assert.match(html, /Cats needs a quick restart/);
  assert.match(html, /Cats needs one setup fix/);
  assert.match(html, /Cats is ready to set up/);
  assert.match(html, /Try again first/);
  assert.match(html, /Return/);
  assert.match(html, /BOOTSTRAP_COPY/);
  assert.match(html, /resolveBootstrapLocale/);
  assert.match(html, /localizeActionLabel/);
  assert.match(html, /localizeIssueTitle/);
  assert.match(html, /localizeIssueDetail/);
  assert.match(html, /localizeBootstrapSummary/);
  assert.match(html, /localizeSetupReason/);
  assert.match(html, /localizeSetupSummary/);
  assert.match(html, /displayStatus/);
  assert.match(html, /'zh-TW'/);
  assert.match(html, /Cats 需要快速重新啟動/);
  assert.match(html, /桌面主機未完成啟動/);
  assert.match(html, /目前沒有可用的供應器目標/);
  assert.match(html, /桌面主機尚未完成先決條件掃描/);
  assert.match(html, /產品初始引導診斷尚無法使用/);
  assert.match(html, /結束 Cats/);
  assert.match(html, /顯示詳細資料/);
  assert.match(html, /歡迎。你可以現在安裝 CLI/);
  assert.match(html, /手動後續步驟/);
  assert.match(html, /完成 \{helperLabel\} 的手動後續步驟/);
  assert.match(html, /啟動 cats-runtime 伴隨服務/);
  assert.match(html, /API 基準設定/);
  assert.match(html, /WSL 發行版需要先完成第一次啟動/);
  assert.match(html, /重新啟動 Cats 桌面主機/);
  assert.match(html, /就緒稽核標記缺少的主機基礎元件/);
  assert.match(html, /請啟動 Docker Desktop/);

  // Back button to leave detail mode
  assert.match(html, /recovery-back/);

  // Expandable detail sections (collapsed by default)
  assert.match(html, /expand-trigger/);
  assert.match(html, /expand-body/);
  assert.match(html, /ExpandableSection/);
  assert.match(html, /What needs attention/);
  assert.match(html, /Local helpers/);
  assert.match(html, /Advanced diagnostics/);
  assert.match(html, /Advanced logs and paths/);
  assert.match(html, /Setup fix/);

  // Service status section preserved
  assert.match(html, /getServiceDisplayName/);
  assert.match(html, /svc-row/);
  assert.match(html, /svc-status/);

  // Summary actions use explicit action-model primary state, not position
  assert.match(html, /primary:\s*action\.primary === true/);
  assert.doesNotMatch(html, /var isFirst = snap\.actions\.indexOf\(action\) === 0;/);

  // Runtime diagnostics lives in advanced details, not Local helpers, and is not runtimeReady-gated
  assert.match(html, /function DiagnosticsSection\(snap\)[\s\S]*open_runtime_diagnostics/);
  assert.match(html, /return ExpandableSection\(tx\('section\.localHelpers'\), \[el\('div', \{ class: 'card' \}, rows\.flat\(\)\)\]\);/);
  assert.match(html, /Open advanced diagnostics/);
  assert.doesNotMatch(html, /var runtimeReady = snap\.services\.some/);

  // Setup recovery section
  assert.match(html, /SetupRecoverySection/);
  assert.match(html, /getSetupSnapshot/);
  assert.match(html, /resumeSetup/);
  assert.match(html, /snap\.setup/);
  assert.match(html, /Recommended next step/);
  assert.match(html, /Continue setup fix/);
  assert.match(html, /renderInterruptions/);

  // Diagnostics section preserved
  assert.match(html, /snap\.diagnostics/);
  assert.match(html, /Recent events/);
  assert.match(html, /hostStatePath/);

  // Slow-launch hint (progressive 20/40/60 s)
  assert.match(html, /slow-hint/);
  assert.match(html, /slowHintMessages/);
  assert.match(html, /retryHintMessage/);
  assert.match(html, /runRetryAction/);
  assert.match(html, /resolveRetryActionId/);
  assert.match(html, /retry_cli_scan/);
  assert.match(html, /showRetryLoadingState/);
  assert.match(html, /scheduleSlowHint/);
  assert.match(html, /slowHintStep = 0;/);

  // Bridge integration & lifecycle
  assert.match(html, /snapshotListenerBound/);
  assert.match(html, /scheduleInitialSnapshotRetry/);
  assert.match(html, /bridge\.getSnapshot\(\)/);
  assert.match(html, /function applySnapshot\(snapshot\)/);
  assert.match(html, /currentSnapshot = snapshot;/);
  assert.match(html, /getSetupSnapshotOrNull\(\)\s*\n\s*\.then/);
  assert.match(html, /window\.setTimeout/);

  // Page mode handling
  assert.match(html, /resolvePageMode/);
  assert.match(html, /snapshot\.app\.onboardingMode === 'setup_status'/);
  assert.match(html, /continueDisabled = legacyCliGate && installedCount === 0/);
  assert.match(html, /ONBOARDING_NATIVE_PROVIDER_ORDER = \[\s*'claude_code', 'cursor_agent', 'kiro', 'junie',\s*'goose', 'ollama'\s*\]/);
  assert.match(html, /ONBOARDING_NPM_PROVIDER_ORDER = \[\s*'codex', 'gemini', 'copilot', 'opencode',\s*'kilo', 'auggie', 'pi'\s*\]/);
  assert.match(html, /Node\.js \/ npm/);
  assert.match(html, /Required by npm CLIs/);
  assert.match(html, /Install Node first/);
  assert.match(html, /cli-card-spinner/);
  assert.match(html, /'spinner-in-status'/);
  assert.match(html, /'spinner-in-button'/);
  assert.match(html, /showCheckingSpinner: !setupSnap/);
  assert.match(html, /if \(!card\.helperId\) return;/);
  assert.match(html, /supportsApply: nodeReady \? false : helper\.supportsApply/);
  assert.match(html, /btnLabel = card\.supportsApply === false \? tx\('status\.installed'\) : tx\('status\.reinstall'\);/);
  assert.doesNotMatch(html, /node-prerequisite-loading/);
  assert.match(html, /ONBOARDING_NODE_HELPER_SUFFIX = '-node-host-installer'/);
  assert.match(html, /cli-row-break/);
  assert.match(html, /ONBOARDING_COLLAPSED_PROVIDER_IDS = \['claude_code', 'codex', 'gemini'\]/);
  assert.match(html, /ONBOARDING_COLLAPSED_INCLUDES_NODE = true/);
  assert.match(html, /hidden = !expanded && !entry\.collapsedSlot/);
  assert.doesNotMatch(html, /elements\.hasHiddenCards/);

  // CSS overflow / layout safety
  assert.match(html, /overflow-x: hidden/);
  assert.match(html, /word-break: break-all/);
  assert.match(html, /white-space: pre-wrap/);

  // Animations
  assert.match(html, /fadeSlideIn/);
  assert.match(html, /dot-pulse/);
  assert.match(html, /@keyframes pulse/);

  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.equal(typeof script, 'string');
  assert.doesNotThrow(() => new Function(script));
});
