import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { launchCli } from './fixtures/cliProcessHarness.mjs';

for (const noOpen of [false, true]) {
  test(`compiled Platform ${noOpen ? 'defers browser opening and handles Ctrl+C' : 'opens once and handles q'}`, { timeout: 60_000 }, async () => {
    const cli = await launchCli({
      entry: resolve('build/server/index.js'), args: noOpen ? ['--no-open'] : [],
    });
    try {
      await cli.waitFor(({ stdout, stderr }) => stdout.includes('q  stop service') && (noOpen || stderr.includes('TEST_BROWSER')));
      assert.match(cli.stdout, new RegExp(`Open Cats: http://127\\.0\\.0\\.1:${cli.port}/\\s`));
      assert.equal((await fetch(`http://127.0.0.1:${cli.port}/health`)).ok, true);
      if (noOpen) assert.doesNotMatch(cli.stderr, /TEST_BROWSER/);
      cli.child.stdin.write('o');
      await cli.waitFor(({ stderr }) => stderr.split('TEST_BROWSER').length === (noOpen ? 2 : 3));
      cli.child.stdin.write(noOpen ? '\x03' : 'q');
      assert.equal((await cli.done).code, 0);
      assert.match(cli.stdout, new RegExp(`cats stopped \\(${noOpen ? 'sigint' : 'keyboard'}\\)`));
      assert.match(cli.stderr, /TEST_RAW false/);
      await assert.rejects(fetch(`http://127.0.0.1:${cli.port}/health`, { signal: AbortSignal.timeout(1000) }));
    } finally {
      await cli.close();
    }
  });
}

test('Platform exits cleanly if its parent disconnects before startup finishes', { timeout: 60_000 }, async () => {
  const cli = await launchCli({ entry: resolve('build/server/index.js') });
  try {
    cli.child.disconnect();
    assert.equal((await cli.done).code, 0, cli.stderr);
    assert.doesNotMatch(cli.stderr, /ERR_SERVER_NOT_RUNNING|TEST_BROWSER|TEST_RAW/);
    assert.doesNotMatch(cli.stdout, /Open Cats:|cats listening/);
  } finally {
    await cli.close();
  }
});

test('JSON Platform startup preserves machine output and accepts private parent shutdown', { timeout: 60_000 }, async () => {
  const cli = await launchCli({ entry: resolve('build/server/index.js'), args: ['--ready-output=json'] });
  try {
    await cli.waitFor(({ stdout }) => stdout.includes('app.ready'));
    assert.doesNotMatch(cli.stderr, /TEST_BROWSER|TEST_RAW/);
    assert.doesNotMatch(cli.stdout, /Open Cats:|q  stop service/);
    cli.child.send({ type: 'cats.shutdown' });
    assert.equal((await cli.done).code, 0);
    assert.match(cli.stdout, /"reason":"parent_requested"/);
  } finally {
    await cli.close();
  }
});
