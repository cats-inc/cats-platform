import type {
  RuntimeProviderDiagnosticsAvailability,
  RuntimeProviderDiagnosticsEntry,
  RuntimeProviderDiagnosticsPayload,
  RuntimeProviderConfigEntry,
  RuntimeProviderConfigRegistry,
  RuntimeProviderInstanceConfig,
} from './client.js';
import { normalizeProductProviderEventCapabilities } from '../shared/providerCatalog.js';

export function readRuntimeErrorText(body: string, fallback: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const payload = JSON.parse(trimmed) as { error?: string };
    return typeof payload.error === 'string' ? payload.error : trimmed;
  } catch {
    return trimmed;
  }
}

export function normalizeRuntimeProviderConfigRegistry(
  payload: unknown,
): RuntimeProviderConfigRegistry {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const root = payload as Record<string, unknown>;
  const providers = root.providers;
  if (!providers || typeof providers !== 'object' || Array.isArray(providers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(providers)
      .map(([provider, rawEntry]) => {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
          return null;
        }

        const entry = rawEntry as Record<string, unknown>;
        const rawInstances = Array.isArray(entry.instances) ? entry.instances : [];
        return [
          provider,
          {
            defaultInstance:
              typeof entry.defaultInstance === 'string' && entry.defaultInstance.trim().length > 0
                ? entry.defaultInstance
                : null,
            defaultBackend:
              typeof entry.defaultBackend === 'string' && entry.defaultBackend.trim().length > 0
                ? entry.defaultBackend
                : null,
            instances: rawInstances
              .map((rawInstance) => {
                if (!rawInstance || typeof rawInstance !== 'object' || Array.isArray(rawInstance)) {
                  return null;
                }

                const instance = rawInstance as Record<string, unknown>;
                const id = typeof instance.id === 'string' ? instance.id.trim() : '';
                if (!id) {
                  return null;
                }

                return {
                  id,
                  target:
                    typeof instance.target === 'string' && instance.target.trim().length > 0
                      ? instance.target
                      : null,
                  backend:
                    typeof instance.backend === 'string' && instance.backend.trim().length > 0
                      ? instance.backend
                      : null,
                  command:
                    typeof instance.command === 'string' && instance.command.trim().length > 0
                      ? instance.command
                      : null,
                  runner:
                    typeof instance.runner === 'string' && instance.runner.trim().length > 0
                      ? instance.runner
                      : null,
                  runtime:
                    typeof instance.runtime === 'string' && instance.runtime.trim().length > 0
                      ? instance.runtime
                      : null,
                  transport:
                    typeof instance.transport === 'string' && instance.transport.trim().length > 0
                      ? instance.transport
                      : null,
                  model:
                    typeof instance.model === 'string' && instance.model.trim().length > 0
                      ? instance.model
                      : null,
                  eventCapabilities: normalizeProductProviderEventCapabilities(
                    instance.eventCapabilities,
                  ),
                };
              })
              .filter((instance): instance is RuntimeProviderInstanceConfig => instance !== null),
          } satisfies RuntimeProviderConfigEntry,
        ] as const;
      })
      .filter((entry): entry is readonly [string, RuntimeProviderConfigEntry] => entry !== null),
  );
}

function normalizeRuntimeProviderDiagnosticsAvailability(
  value: unknown,
): RuntimeProviderDiagnosticsAvailability {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: 'unknown',
      summary: null,
      attentionCodes: [],
    };
  }

  const availability = value as Record<string, unknown>;
  const rawStatus = typeof availability.status === 'string'
    ? availability.status.trim().toLowerCase()
    : '';

  return {
    status:
      rawStatus === 'ok'
      || rawStatus === 'degraded'
      || rawStatus === 'unavailable'
      || rawStatus === 'unknown'
        ? rawStatus
        : 'unknown',
    summary:
      typeof availability.summary === 'string' && availability.summary.trim().length > 0
        ? availability.summary
        : null,
    attentionCodes: Array.isArray(availability.attentionCodes)
      ? availability.attentionCodes
        .filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
      : [],
  };
}

export function normalizeRuntimeProviderDiagnosticsPayload(
  payload: unknown,
): RuntimeProviderDiagnosticsPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      probe: 'light',
      providers: [],
    };
  }

  const root = payload as Record<string, unknown>;
  const rawProviders = Array.isArray(root.providers) ? root.providers : [];

  return {
    probe:
      typeof root.probe === 'string' && root.probe.trim().length > 0
        ? root.probe
        : 'light',
    providers: rawProviders
      .map((rawEntry) => {
        if (!rawEntry || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) {
          return null;
        }

        const entry = rawEntry as Record<string, unknown>;
        const provider = typeof entry.provider === 'string' ? entry.provider.trim() : '';
        if (!provider) {
          return null;
        }

        return {
          provider,
          backend:
            typeof entry.backend === 'string' && entry.backend.trim().length > 0
              ? entry.backend
              : null,
          instance:
            typeof entry.instance === 'string' && entry.instance.trim().length > 0
              ? entry.instance
              : null,
          availability: normalizeRuntimeProviderDiagnosticsAvailability(entry.availability),
        } satisfies RuntimeProviderDiagnosticsEntry;
      })
      .filter((entry): entry is RuntimeProviderDiagnosticsEntry => entry !== null),
  };
}
