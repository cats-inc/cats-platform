import {
  readJsonBody,
  sendJson,
  sendMethodNotAllowed,
  type RouteContext,
} from '../../../shared/http.js';
import {
  ExternalIssueImportFetcherError,
  fetchExternalIssueImportDraftFromUrl,
} from '../integrations/externalIssueImportFetcher.js';
import type { ExternalIssueImportProvider } from '../integrations/externalIssueImport.js';
import { createWorkExternalIssueImportDelegate } from '../state/workExternalIssueImportDelegate.js';
import { WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH } from '../shared/apiPaths.js';
import type { WorkApiDependencies } from './index.js';

export async function routeWorkExternalIssueImportApi(
  context: RouteContext<WorkApiDependencies>,
): Promise<boolean> {
  if (context.url.pathname !== WORK_API_EXTERNAL_ISSUE_IMPORTS_PATH) {
    return false;
  }
  if (context.method !== 'POST') {
    sendMethodNotAllowed(context.response, ['POST']);
    return true;
  }

  const body = await readJsonBody<Record<string, unknown>>(context.request);
  const externalUrl = readNonBlankString(body.externalUrl);
  if (!externalUrl) {
    sendJson(context.response, 400, {
      error: {
        code: 'external_issue_import_url_required',
        message: 'externalUrl is required.',
      },
    });
    return true;
  }

  try {
    const selectedProvider = readProvider(body.provider);
    const fetchResult = await fetchExternalIssueImportDraftFromUrl(
      externalUrl,
      {
        ...context.dependencies.externalIssueImport,
        selectedProvider:
          selectedProvider ?? context.dependencies.externalIssueImport?.selectedProvider,
      },
    );
    const core = await context.dependencies.coreStore.readCore();
    const delegate = createWorkExternalIssueImportDelegate({
      coreStore: context.dependencies.coreStore,
      now: context.dependencies.now,
    });
    const importResult = await delegate.importDraft(
      fetchResult.draft,
      {
        actorRef: core.ownerProfile.actorId,
        actionId: buildExternalIssueImportActionId(fetchResult.source),
        runId: 'work-api:external-issue-imports',
      },
    );

    if (importResult.status === 'applied') {
      sendJson(context.response, 200, {
        ...importResult.result,
        source: fetchResult.source,
      });
      return true;
    }
    if (importResult.status === 'pending_approval') {
      sendJson(context.response, 202, importResult);
      return true;
    }

    sendJson(context.response, 400, {
      error: {
        code: importResult.error.code,
        message: importResult.error.message,
        details: importResult.error.details ?? null,
      },
    });
    return true;
  } catch (error) {
    sendJson(context.response, 400, {
      error: externalIssueImportRouteError(error),
    });
    return true;
  }
}

function buildExternalIssueImportActionId(input: {
  provider: string;
  externalType: string;
  externalId: string;
}): string {
  return [
    'work-api',
    'work.external.import_issue',
    input.provider,
    input.externalType,
    input.externalId,
  ].join(':');
}

function externalIssueImportRouteError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof ExternalIssueImportFetcherError) {
    return {
      code: error.code,
      message: error.message,
    };
  }
  if (isCodedError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.status === null ? undefined : { status: error.status },
    };
  }

  return {
    code: 'external_issue_import_failed',
    message: error instanceof Error ? error.message : 'External issue import failed.',
  };
}

function readProvider(value: unknown): ExternalIssueImportProvider | undefined {
  const normalized = readNonBlankString(value);
  if (
    normalized === 'github'
    || normalized === 'gitlab'
    || normalized === 'gitea'
    || normalized === 'redmine'
    || normalized === 'bugzilla'
  ) {
    return normalized;
  }
  return undefined;
}

function readNonBlankString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isCodedError(input: unknown): input is {
  code: string;
  message: string;
  status: number | null;
} {
  return typeof input === 'object'
    && input !== null
    && 'code' in input
    && typeof (input as { code?: unknown }).code === 'string'
    && 'message' in input
    && typeof (input as { message?: unknown }).message === 'string'
    && 'status' in input
    && (
      typeof (input as { status?: unknown }).status === 'number'
      || (input as { status?: unknown }).status === null
    );
}
