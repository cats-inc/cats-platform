import { upsertCoreTransportBinding } from '../model/index.js';
import {
  handleCoreError,
  readEnumValue,
  readMetadata,
  readNullableString,
  readOptionalString,
  readWrappedBody,
} from './shared.js';
import {
  CORE_TRANSPORT_BINDING_DIRECTIONS,
  CORE_TRANSPORT_BINDING_PLATFORMS,
  CORE_TRANSPORT_BINDING_STATUSES,
} from './constants.js';
import type { CoreApiRouteContext } from './types.js';
import { sendJson, sendMethodNotAllowed } from '../../shared/http.js';

async function handleCoreTransportBindings(
  context: CoreApiRouteContext,
): Promise<void> {
  const core = await context.dependencies.coreStore.readCore();
  sendJson(context.response, 200, { transportBindings: core.transportBindings });
}

async function handleCoreTransportBindingWrite(
  context: CoreApiRouteContext,
): Promise<void> {
  try {
    const transportBinding = await readWrappedBody(context, 'transportBinding');
    const next = upsertCoreTransportBinding(
      await context.dependencies.coreStore.readCore(),
      {
        id: readOptionalString(transportBinding.id, 'transportBinding.id'),
        platform:
          readEnumValue(
            transportBinding.platform,
            'transportBinding.platform',
            CORE_TRANSPORT_BINDING_PLATFORMS,
          ) ?? 'internal',
        direction: readEnumValue(
          transportBinding.direction,
          'transportBinding.direction',
          CORE_TRANSPORT_BINDING_DIRECTIONS,
        ),
        conversationId: readNullableString(
          transportBinding.conversationId,
          'transportBinding.conversationId',
        ),
        participantId: readNullableString(
          transportBinding.participantId,
          'transportBinding.participantId',
        ),
        agentId: readNullableString(
          transportBinding.agentId,
          'transportBinding.agentId',
        ),
        externalThreadKey: readNullableString(
          transportBinding.externalThreadKey,
          'transportBinding.externalThreadKey',
        ),
        status: readEnumValue(
          transportBinding.status,
          'transportBinding.status',
          CORE_TRANSPORT_BINDING_STATUSES,
        ),
        createdAt: readOptionalString(
          transportBinding.createdAt,
          'transportBinding.createdAt',
        ),
        metadata: readMetadata(transportBinding.metadata, 'transportBinding.metadata'),
      },
    );
    const persisted = await context.dependencies.coreStore.writeCore(next.core);
    const persistedTransportBinding = persisted.transportBindings.find(
      (candidate) => candidate.id === next.transportBinding.id,
    );

    sendJson(context.response, next.created ? 201 : 200, {
      transportBinding: persistedTransportBinding ?? next.transportBinding,
      created: next.created,
    });
  } catch (error) {
    handleCoreError(context, error);
  }
}

export async function routeCoreInteractionRecordApi(
  context: CoreApiRouteContext,
): Promise<boolean> {
  if (context.url.pathname === '/api/core/transport-bindings') {
    if (context.method === 'GET') {
      await handleCoreTransportBindings(context);
      return true;
    }
    if (context.method === 'POST') {
      await handleCoreTransportBindingWrite(context);
      return true;
    }
    sendMethodNotAllowed(context.response, ['GET', 'POST']);
    return true;
  }

  return false;
}
