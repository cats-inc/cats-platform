/**
 * Glyphs of the composer's plus menu, on the composer's 16 px grid with a 1.5 stroke. Attaching files is a
 * paperclip and a screenshot is a dragged-out region with a pointer, the conventions chat apps use; the
 * screenshot is not a camera, since nothing is photographed. Diagnostics is a pulse line, so the menu's
 * own "+" stays the only plus. Cats Bot's composer uses the same paths (`composerIcons.tsx`).
 */

function MenuGlyph({ paths }: { paths: readonly string[] }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

const ATTACH_FILES = ['M13.5 7.5 8 13a3.5 3.5 0 0 1-5-5l5.5-5.5a2.5 2.5 0 0 1 3.5 3.5l-5.5 5.5a1.2 1.2 0 0 1-1.7-1.7L10 4.5'];
const SCREENSHOT_REGION = [
  'M2 5V3a1 1 0 0 1 1-1h2M11 2h2a1 1 0 0 1 1 1v1.5M5 14H3a1 1 0 0 1-1-1v-2M7.25 2h1.5M2 7.25v1.5M7.25 14H8.5',
  'M9.5 9.5l5 1.8-2.1.8-.8 2.1z',
];
const DIAGNOSTICS = ['M1.5 8.5h2.75L6 4l4 8 1.75-3.5h2.75'];

export function AttachFilesIcon() {
  return <MenuGlyph paths={ATTACH_FILES} />;
}

export function ScreenshotRegionIcon() {
  return <MenuGlyph paths={SCREENSHOT_REGION} />;
}

export function DiagnosticsIcon() {
  return <MenuGlyph paths={DIAGNOSTICS} />;
}
