/**
 * What a provider save or scan adds to the diagnostics record (SPEC-136 FR-37). Selection saves,
 * scans and connection tests recorded nothing before, so a failure there had no evidence behind
 * the details page. Only fixed words and the error's own text go in, never a page's input.
 */

interface TargetLike {
  provider: string;
  backend: string;
  instance: string;
}

interface ObservationLike extends TargetLike {
  connectionStatus?: string | null;
  detail?: string | null;
}

export interface SetupEventInput {
  kind: string;
  summary: string;
  status: 'ok' | 'info' | 'degraded' | 'unavailable';
  context?: Record<string, unknown>;
  errorMessage?: string;
}

const sameTarget = (left: TargetLike, right: TargetLike) => left.provider === right.provider
  && left.backend === right.backend && left.instance === right.instance;

/**
 * SPEC-136 FR-38: running a helper, opening a terminal and pulling a model belong to the host's own
 * page, which is a data: document. Platform's pages read and add to the log, and that is all.
 */
export function isSetupHostPage(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}

export function selectionSaveEvent(targetCount: number, error?: unknown): SetupEventInput {
  if (error === undefined) {
    return {
      kind: 'selection_saved',
      summary: `Saved a selection of ${targetCount} tool(s).`,
      status: 'ok',
      context: { targetCount },
    };
  }
  return {
    kind: 'selection_save_failed',
    summary: 'The tool selection was not saved.',
    status: 'unavailable',
    context: { targetCount },
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

/** One event per target that reports a connection, or one for a scan that did not finish. */
export function scanEvents(
  targets: TargetLike[],
  observations: ObservationLike[] | undefined,
  error?: unknown,
): SetupEventInput[] {
  if (error !== undefined) {
    return [{
      kind: 'scan_failed',
      summary: 'Cats Runtime did not finish checking the chosen tools.',
      status: 'unavailable',
      context: { targetCount: targets.length },
      errorMessage: error instanceof Error ? error.message : String(error),
    }];
  }
  const events: SetupEventInput[] = [];
  for (const target of targets) {
    const observation = observations?.find((entry) => sameTarget(entry, target));
    if (observation?.connectionStatus === 'connected') {
      events.push({
        kind: 'connection_tested',
        summary: `Connected to ${target.provider}.`,
        status: 'ok',
        context: { provider: target.provider, backend: target.backend, instance: target.instance },
      });
    } else if (observation?.connectionStatus === 'failed') {
      events.push({
        kind: 'connection_test_failed',
        summary: `Could not connect to ${target.provider}.`,
        status: 'unavailable',
        context: { provider: target.provider, backend: target.backend, instance: target.instance },
        errorMessage: observation.detail ?? 'The connection test failed.',
      });
    }
  }
  return events;
}
