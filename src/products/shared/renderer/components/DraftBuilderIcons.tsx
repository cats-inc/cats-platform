// Icons for the draft builder's two teaching affordances:
// - CollaborateIcon: lead row's +collaborate (and shadow rows reuse it).
// - CompareIcon: footer's +compare button that appends a parallel branch.
//
// The blue accent that highlights the "active teaching" button in
// +Group / +Parallel presets lives in chat-composer-base.css and is
// driven by the --draft-teaching-accent CSS custom property — change
// the colour in one place and both buttons follow.

interface IconProps {
  size?: number;
}

export function CollaborateIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 13c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" />
      <path d="M13 4v4" />
      <path d="M11 6h4" />
    </svg>
  );
}

export function CompareIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Chat bubble with a small tail at the bottom-left corner.
        * Sized to match CollaborateIcon's person silhouette so the
        * two teaching buttons feel equally weighted. */}
      <path d="M1.5 4C1.5 3.17 2.17 2.5 3 2.5H8.5C9.33 2.5 10 3.17 10 4V9C10 9.83 9.33 10.5 8.5 10.5H5L3 12.5V10.5C2.17 10.5 1.5 9.83 1.5 9V4Z" />
      {/* Plus sign, same size and centre as CollaborateIcon. */}
      <path d="M13 4v4" />
      <path d="M11 6h4" />
    </svg>
  );
}
