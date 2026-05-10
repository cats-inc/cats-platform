import type { PlatformAuthConfig } from './config.js';
import {
  createPlatformAppDescriptor,
  createPlatformResponseMetadata,
} from '../../shared/platformEnvelopeMetadata.js';

export type PlatformAuthBootstrapRouteTarget = 'setup' | 'login' | 'repair';
export type PlatformAuthBootstrapStateStatus = 'ready' | 'missing' | 'corrupt';

export interface PlatformAuthBootstrapEnvelope {
  app: ReturnType<typeof createPlatformAppDescriptor>;
  metadata: ReturnType<typeof createPlatformResponseMetadata>;
  setup: {
    completeAt: string | null;
    required: boolean;
    repairRequired: boolean;
  };
  auth: {
    authenticated: false;
    csrfToken: null;
    providers: {
      google: {
        enabled: boolean;
        clientId: string | null;
      };
    };
  };
  routeTarget: PlatformAuthBootstrapRouteTarget;
}

export function buildPlatformAuthBootstrapEnvelope(input: {
  auth: PlatformAuthConfig;
  host: string;
  port: number;
  setupCompleteAt: string | null;
  authStateStatus: PlatformAuthBootstrapStateStatus;
  now?: Date;
}): PlatformAuthBootstrapEnvelope {
  const repairRequired = input.setupCompleteAt !== null && input.authStateStatus !== 'ready';
  return {
    app: createPlatformAppDescriptor(),
    metadata: createPlatformResponseMetadata({
      generatedAt: input.now ?? new Date(),
      host: input.host,
      port: input.port,
    }),
    setup: {
      completeAt: input.setupCompleteAt,
      required: input.setupCompleteAt === null,
      repairRequired,
    },
    auth: {
      authenticated: false,
      csrfToken: null,
      providers: {
        google: {
          enabled: Boolean(input.auth.google.clientId),
          clientId: input.auth.google.clientId,
        },
      },
    },
    routeTarget: repairRequired
      ? 'repair'
      : input.setupCompleteAt === null
        ? 'setup'
        : 'login',
  };
}
