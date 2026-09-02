import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Work Task detail exposes approved-task start action in the top bar', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/tasks/TaskDetailPage.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /const canStartRun = task\.status === "approved" && taskRuns\.length === 0;/u,
    'an approved Task that already has a Run must not offer Start run again (FR-24)',
  );
  assert.match(source, /className="taskDetailTopBar__action taskDetailTopBar__action--primary"/u);
  assert.match(source, /onClick=\{handleStartRun\}/u);
  assert.match(source, /disabled=\{startRunMutation\.isPending\}/u);
  assert.match(source, /t\("workTaskNoRunsActionLabel"\)/u);
  assert.match(source, /t\("workTaskStartRunBusyLabel"\)/u);
});

test('Work Task detail keeps the manual approval path for non-golden-path work', async () => {
  // FR-25: the golden path is additive. A Task that arrived through Desktop
  // still gets the ordinary approve / reject / start controls.
  const source = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/tasks/TaskDetailPage.tsx'),
    'utf8',
  );

  assert.match(source, /approvalDecisionPending/u, 'the manual approval control survives');
  assert.match(source, /handleStartRun/u, 'the manual start control survives');
  assert.match(
    source,
    /<GoldenPathSection taskId=\{task\.id\} \/>/u,
    'and the transport panel is a separate section rather than a replacement',
  );
});
