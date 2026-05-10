/// <reference lib="dom" />

export const GOOGLE_IDENTITY_SERVICES_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_GIS_CSRF_COOKIE_NAME = 'g_csrf_token';

export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export interface GoogleIdentityServicesApi {
  accounts: {
    id: {
      initialize(config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServicesApi;
  }
}

let googleIdentityServicesLoad: Promise<GoogleIdentityServicesApi> | null = null;

export function loadGoogleIdentityServices(
  doc: Document = document,
  win: Window = window,
): Promise<GoogleIdentityServicesApi> {
  if (win.google?.accounts?.id) {
    return Promise.resolve(win.google);
  }
  if (googleIdentityServicesLoad) {
    return googleIdentityServicesLoad;
  }

  googleIdentityServicesLoad = new Promise((resolve, reject) => {
    const existing = doc.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SERVICES_SRC}"]`,
    );
    const script = existing ?? doc.createElement('script');
    script.src = GOOGLE_IDENTITY_SERVICES_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (win.google?.accounts?.id) {
        resolve(win.google);
        return;
      }
      reject(new Error('Google Identity Services did not initialize.'));
    };
    script.onerror = () => {
      reject(new Error('Google Identity Services could not be loaded.'));
    };
    if (!existing) {
      doc.head.appendChild(script);
    }
  });

  return googleIdentityServicesLoad;
}

export function createGoogleGisCsrfToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let raw = '';
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export function writeGoogleGisCsrfCookie(
  token: string,
  doc: Document = document,
): void {
  const secure = doc.location.protocol === 'https:' ? '; Secure' : '';
  doc.cookie = `${GOOGLE_GIS_CSRF_COOKIE_NAME}=${encodeURIComponent(
    token,
  )}; Path=/; SameSite=Lax${secure}`;
}

export function resetGoogleIdentityServicesForTests(): void {
  googleIdentityServicesLoad = null;
}
