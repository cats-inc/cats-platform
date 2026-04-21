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
      <path d="M8 3v10" />
      <path d="M3 8h10" />
    </svg>
  );
}
