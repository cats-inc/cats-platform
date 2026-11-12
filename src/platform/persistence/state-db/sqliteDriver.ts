/*! @license
 * MIT License
 *
 * Copyright (c) 2026 sammykenny2 and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Adapted from cats-inc/cats-bot tag state-db-p1 (MIT); see NOTICE.md.

/**
 * SPEC-014 FR-2: the one place that reaches `node:sqlite`. Everything else in the bot uses the
 * storage adapter built on it, so a different driver can replace this module if the built-in
 * one stops passing `tests/core/sqliteDriver.test.ts` on a supported platform.
 *
 * The driver is loaded on first use, not at import: Node 24, which the app ships inside
 * Electron, still marks `node:sqlite` experimental and prints an ExperimentalWarning the moment
 * the module loads. A plain `import` would put that line on the stderr of every host that
 * reads bot data, including one-shot CLI commands.
 */

export type SqliteInput = null | number | bigint | string | Uint8Array;
export type SqliteOutput = null | number | bigint | string | Uint8Array;
export interface SqliteStatement {
  get(...parameters: SqliteInput[]): Record<string, SqliteOutput> | undefined;
  all(...parameters: SqliteInput[]): Record<string, SqliteOutput>[];
  iterate(...parameters: SqliteInput[]): Iterable<Record<string, SqliteOutput>>;
  run(...parameters: SqliteInput[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  setReadBigInts(value: boolean): void;
}
export interface SqliteDatabase {
  readonly isTransaction: boolean;
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
export interface SqliteDriver {
  DatabaseSync: new (file: string | URL, options?: { readOnly?: boolean }) => SqliteDatabase;
}

let driver: SqliteDriver | undefined;

/** Loads `node:sqlite` once, dropping only its own experimental notice. */
export function sqliteDriver(): SqliteDriver {
  if (driver) return driver;
  const emitWarning = process.emitWarning;
  const quiet = (warning: string | Error, ...rest: unknown[]): void => {
    if (isSqliteExperimentalNotice(warning)) return;
    Reflect.apply(emitWarning, process, [warning, ...rest]);
  };
  process.emitWarning = quiet as typeof process.emitWarning;
  let loaded: SqliteDriver | undefined;
  try {
    // Undefined when the runtime was started with `--no-experimental-sqlite`.
    if (typeof process.getBuiltinModule === 'function') {
      loaded = process.getBuiltinModule('node:sqlite') as unknown as SqliteDriver | undefined;
    }
  } finally {
    process.emitWarning = emitWarning;
  }
  if (typeof loaded?.DatabaseSync !== 'function') {
    throw new Error(
      `node:sqlite is not available in this Node.js (${process.version}). The Platform state database needs Node.js 24 or later, started without --no-experimental-sqlite.`,
    );
  }
  driver = loaded;
  return driver;
}

function isSqliteExperimentalNotice(warning: string | Error): boolean {
  const text = typeof warning === 'string' ? warning : warning?.message;
  return typeof text === 'string' && /^SQLite is an experimental feature/u.test(text);
}
