import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('Work Items list exposes the external issue import dialog entrypoint', () => {
  const listPage = readSource(
    '../src/products/work/renderer/components/work-items/WorkItemsListPage.tsx',
  );
  const dialog = readSource(
    '../src/products/work/renderer/components/work-items/ImportExternalIssueDialog.tsx',
  );
  const css = readSource(
    '../src/products/work/renderer/components/work-items/work-items.css',
  );

  assert.match(listPage, /ImportExternalIssueDialog/u);
  assert.match(listPage, /workItemsListImportExternalIssueAction/u);
  assert.match(listPage, /setImportDialogOpen\(true\)/u);
  assert.match(css, /workItemsListTopBar__addBtn--secondary/u);

  assert.match(dialog, /importWorkExternalIssue/u);
  assert.match(dialog, /WORK_ITEMS_QUERY_KEY/u);
  assert.match(dialog, /WORK_GRAPH_QUERY_KEY/u);
  assert.match(dialog, /WORK_DASHBOARD_QUERY_KEY/u);
  assert.match(dialog, /"github"/u);
  assert.match(dialog, /"redmine"/u);
  assert.match(dialog, /"bugzilla"/u);
});

test('external issue import UI strings are localized', () => {
  const keys = readSource('../src/shared/i18n/messageKeys.ts');
  const english = readSource('../src/shared/i18n/catalogs/en.ts');
  const traditionalChinese = readSource('../src/shared/i18n/catalogs/zh-TW.ts');

  for (const key of [
    'work.items.importExternalIssueAction',
    'work.items.importExternalIssueAriaLabel',
    'work.external.import.dialogTitle',
    'work.external.import.providerLabel',
    'work.external.import.urlLabel',
    'work.external.import.urlPlaceholder',
    'work.external.import.cancelButton',
    'work.external.import.submitLabel',
    'work.external.import.submitBusyLabel',
    'work.external.import.error',
  ]) {
    assert.match(keys, new RegExp(key.replaceAll('.', '\\.'), 'u'));
    assert.match(english, new RegExp(key.replaceAll('.', '\\.'), 'u'));
    assert.match(
      traditionalChinese,
      new RegExp(key.replaceAll('.', '\\.'), 'u'),
    );
  }
});
