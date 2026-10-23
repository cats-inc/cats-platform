/** Browser-safe Cat image reference for the shared transcript and Cat settings surfaces. */
export interface CatImageAttachment {
  schemaVersion: 1;
  catId: string;
  jobId: string;
  sha256: string;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export function readCatImageAttachment(metadata: Readonly<Record<string, unknown>>): CatImageAttachment | null {
  const value = metadata.catImageAttachment;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return item.schemaVersion === 1 && typeof item.catId === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(item.catId)
    && typeof item.jobId === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(item.jobId)
    && typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256)
    && ['image/jpeg', 'image/png'].includes(String(item.mimeType))
    && Number.isSafeInteger(item.width) && Number(item.width) > 0 && Number(item.width) <= 4096
    && Number.isSafeInteger(item.height) && Number(item.height) > 0 && Number(item.height) <= 4096
    ? item as unknown as CatImageAttachment : null;
}

export function catImageAttachmentUrl(attachment: Pick<CatImageAttachment, 'catId' | 'jobId'>): string {
  return `/api/cats/${encodeURIComponent(attachment.catId)}/images/${encodeURIComponent(attachment.jobId)}/image`;
}
