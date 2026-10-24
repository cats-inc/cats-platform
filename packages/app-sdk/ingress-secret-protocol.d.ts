export type IngressSecretPurpose = 'credential' | 'backup';
export interface IngressSecretProtector {
  seal(purpose: IngressSecretPurpose, value: string): Promise<string>;
  unseal(purpose: IngressSecretPurpose, value: string): Promise<string>;
}
export const INGRESS_SECRET_REQUEST: 'cats.ingress.secret.request';
export const INGRESS_SECRET_RESPONSE: 'cats.ingress.secret.response';
export const MAX_INGRESS_SECRET_BYTES: number;
export interface IngressSecretRequest {
  type: typeof INGRESS_SECRET_REQUEST; id: string;
  operation: 'seal' | 'unseal'; purpose: IngressSecretPurpose; value: string;
}
export function isIngressSecretRequest(value: unknown): value is IngressSecretRequest;
