/**
 * The composer's send glyph on its 16 px grid with a 1.5 stroke: the up arrow, and Telegram's paper plane in a
 * direct message whose cat reaches Telegram (`directMessageTelegram.ts`), as Cats Bot draws its direct message's
 * (`composerIcons.tsx`, same paths).
 */
export function ComposerSendIcon({ direct }: { direct: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {direct ? (
        <>
          <path d="M14.5 1.5 1.5 6.5l5.5 2.5 2.5 5.5z" />
          <path d="M14.5 1.5 7 9" />
        </>
      ) : (
        <>
          <path d="M8 13V3" />
          <path d="M3 7l5-5 5 5" />
        </>
      )}
    </svg>
  );
}
