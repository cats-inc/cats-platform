import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Work Task detail exposes approved-task start action in the top bar', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'src/products/work/renderer/components/tasks/TaskDetailPage.tsx'),
    'utf8',
  );

  assert.match(source, /const canStartRun = task\.status === "approved"/u);
  assert.match(source, /className="taskDetailTopBar__action taskDetailTopBar__action--primary"/u);
  assert.match(source, /onClick=\{handleStartRun\}/u);
  assert.match(source, /disabled=\{startRunMutation\.isPending\}/u);
  assert.match(source, /t\("workTaskNoRunsActionLabel"\)/u);
  assert.match(source, /t\("workTaskStartRunBusyLabel"\)/u);
});
