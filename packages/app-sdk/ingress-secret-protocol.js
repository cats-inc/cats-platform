// Private Desktop/Platform child-process protocol; never a renderer or HTTP API.
export const INGRESS_SECRET_REQUEST = 'cats.ingress.secret.request';
export const INGRESS_SECRET_RESPONSE = 'cats.ingress.secret.response';
export const MAX_INGRESS_SECRET_BYTES = 4 * 1024 * 1024;
export function isIngressSecretRequest(input) {
  return !!input && input.type === INGRESS_SECRET_REQUEST
    && typeof input.id === 'string' && /^[a-f0-9-]{36}$/.test(input.id)
    && (input.operation === 'seal' || input.operation === 'unseal')
    && (input.purpose === 'credential' || input.purpose === 'backup')
    && typeof input.value === 'string' && input.value.length <= MAX_INGRESS_SECRET_BYTES;
}
