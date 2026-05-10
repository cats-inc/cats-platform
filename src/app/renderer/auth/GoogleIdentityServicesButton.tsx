import { useEffect, useRef } from 'react';

import {
  createGoogleGisCsrfToken,
  loadGoogleIdentityServices,
  writeGoogleGisCsrfCookie,
} from './googleIdentityServices.js';

export interface GoogleIdentityCredential {
  credential: string;
  csrfToken: string;
}

export function GoogleIdentityServicesButton({
  clientId,
  disabled,
  onCredential,
  onError,
}: {
  clientId: string;
  disabled?: boolean;
  onCredential: (credential: GoogleIdentityCredential) => void;
  onError: (error: Error) => void;
}) {
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (disabled) {
      return;
    }
    let cancelled = false;
    const csrfToken = createGoogleGisCsrfToken();
    writeGoogleGisCsrfCookie(csrfToken);

    void loadGoogleIdentityServices()
      .then((google) => {
        if (cancelled || !buttonRef.current) {
          return;
        }
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            const credential = response.credential?.trim();
            if (!credential) {
              onError(new Error('Google did not return an ID token.'));
              return;
            }
            onCredential({ credential, csrfToken });
          },
        });
        buttonRef.current.innerHTML = '';
        google.accounts.id.renderButton(buttonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          onError(error instanceof Error ? error : new Error('Google sign-in failed.'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, onCredential, onError]);

  return <div className="googleSignInButton" ref={buttonRef} />;
}
