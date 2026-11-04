/**
 * The first-run wizard's log (SPEC-136 FR-21, FR-22). The host owns it because the bootstrap
 * page is replaced when setup moves on to Platform, and both pages show the same log.
 *
 * It holds whole commands and whatever a helper reported, for this process only. `host.log`
 * gets fixed words about a run through `record`, because ADR-145 keeps arguments and helper
 * text out of that file.
 */

export type SetupRunKind = 'check' | 'change' | 'terminal' | 'service';

export interface SetupRun {
  id: number;
  kind: SetupRunKind;
  label: string;
  command: string;
  startedAt: string;
  endedAt: string | null;
  status: string | null;
  version: string | null;
  planned: string[];
  applied: string[];
  warnings: string[];
  manual: string[];
  error: string | null;
  tookMs: number | null;
}

export type SetupRunResult = Partial<Pick<SetupRun,
  'status' | 'version' | 'planned' | 'applied' | 'warnings' | 'manual' | 'error'>>;

interface SetupRunLogOptions {
  limit?: number;
  now?: () => Date;
  /** Told about each change to a run. A listener that throws never reaches the caller. */
  onChange?: (run: SetupRun) => void;
  /** Fixed words only, for the bounded host log. */
  record?: (fields: Record<string, unknown>) => void;
  redact?: (text: string) => string;
}

const TEXT_LIMIT = 4_000;
const LIST_LIMIT = 50;

export class SetupRunLog {
  private readonly runs: SetupRun[] = [];
  private nextId = 1;
  private readonly limit: number;
  private readonly now: () => Date;
  private readonly redact: (text: string) => string;

  constructor(private readonly options: SetupRunLogOptions = {}) {
    this.limit = options.limit ?? 500;
    this.now = options.now ?? (() => new Date());
    this.redact = options.redact ?? ((text) => text);
  }

  start(input: { kind: SetupRunKind; label: string; command: string }): number {
    const run: SetupRun = {
      id: this.nextId++,
      kind: input.kind,
      label: this.text(input.label),
      command: this.text(input.command),
      startedAt: this.now().toISOString(),
      endedAt: null,
      status: null,
      version: null,
      planned: [],
      applied: [],
      warnings: [],
      manual: [],
      error: null,
      tookMs: null,
    };
    this.runs.push(run);
    if (this.runs.length > this.limit) this.runs.splice(0, this.runs.length - this.limit);
    this.notify(run);
    return run.id;
  }

  /** An unknown or finished run stays as it is: a late result must not rewrite the record. */
  finish(id: number, result: SetupRunResult = {}): SetupRun | null {
    const run = this.runs.find((entry) => entry.id === id);
    if (!run || run.endedAt) return null;
    const ended = this.now();
    run.endedAt = ended.toISOString();
    run.tookMs = Math.max(0, ended.getTime() - new Date(run.startedAt).getTime());
    run.status = result.status === undefined ? null : this.optionalText(result.status);
    run.version = result.version === undefined ? null : this.optionalText(result.version);
    run.error = result.error === undefined ? null : this.optionalText(result.error);
    run.planned = this.textList(result.planned);
    run.applied = this.textList(result.applied);
    run.warnings = this.textList(result.warnings);
    run.manual = this.textList(result.manual);
    this.notify(run);
    try {
      this.options.record?.({
        kind: run.kind,
        label: run.label,
        status: run.status,
        changes: run.applied.length,
        tookMs: run.tookMs,
      });
    } catch { /* Diagnostics must not interrupt setup. */ }
    return run;
  }

  list(): SetupRun[] {
    return this.runs.map((run) => ({
      ...run,
      planned: [...run.planned],
      applied: [...run.applied],
      warnings: [...run.warnings],
      manual: [...run.manual],
    }));
  }

  private notify(run: SetupRun): void {
    try { this.options.onChange?.({ ...run }); } catch { /* A closed window is not setup's problem. */ }
  }

  private text(value: string): string {
    const redacted = this.redact(value);
    return redacted.length > TEXT_LIMIT ? `${redacted.slice(0, TEXT_LIMIT)}…` : redacted;
  }

  private optionalText(value: string | null): string | null {
    return value === null ? null : this.text(value);
  }

  private textList(values: string[] | undefined): string[] {
    return (values ?? []).slice(0, LIST_LIMIT).map((value) => this.text(String(value)));
  }
}
