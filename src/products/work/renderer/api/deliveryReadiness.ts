/**
 * Desktop's read of Telegram delegation readiness (SPEC-114 FR-3, gate G1).
 *
 * The bot already tells the owner why a `/work` request was refused. This is the
 * same answer on the surface where the prerequisites are actually fixed, served
 * from the same evaluator so the two can never disagree.
 */

import type { CoreDeliveryMode } from '../../../../core/types.js';
import type {
  TransportWorkReadiness,
} from '../../../../platform/transports/work-delivery/contracts.js';
import type { SupervisionToolScope } from '../../../../platform/supervision/contracts.js';
import { WORK_API_DELIVERY_READINESS_PATH } from '../../shared/apiPaths.js';
import { expectJson } from './http.js';

export interface WorkDeliveryReadinessBinding {
  bindingId: string;
  botName: string | null;
  deliveryMode: CoreDeliveryMode;
  toolScope: SupervisionToolScope;
  readiness: TransportWorkReadiness;
}

export interface WorkDeliveryReadinessReport {
  /** False when the golden path is switched off for this host. */
  enabled: boolean;
  workspacePath: string | null;
  authorizedOwnerCount: number;
  bindings: WorkDeliveryReadinessBinding[];
}

/** `errorMessage` is passed in already localized; this layer holds no copy. */
export async function fetchWorkDeliveryReadiness(
  errorMessage: string,
  signal?: AbortSignal,
): Promise<WorkDeliveryReadinessReport> {
  return expectJson<WorkDeliveryReadinessReport>(
    await fetch(WORK_API_DELIVERY_READINESS_PATH, { signal }),
    errorMessage,
  );
}
