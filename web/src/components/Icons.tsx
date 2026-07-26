/**
 * Inline SVG icons. Kept as a module rather than an icon font or sprite sheet
 * because television browsers frequently fail to load external font formats,
 * and a missing glyph would leave the player without a play button.
 */
type Props = { className?: string };

const svg = (children: React.ReactNode) =>
  function Icon({ className }: Props) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true" focusable="false">
        {children}
      </svg>
    );
  };

const stroke = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const PlayIcon = svg(<path d="M6 4.5v15l13-7.5z" fill="currentColor" />);
export const PauseIcon = svg(
  <>
    <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
  </>,
);
export const DownloadIcon = svg(
  <>
    <path d="M12 3v12" {...stroke} />
    <path d="m7 10.5 5 5 5-5" {...stroke} />
    <path d="M4 20h16" {...stroke} />
  </>,
);
export const PlusIcon = svg(
  <>
    <path d="M12 5v14" {...stroke} />
    <path d="M5 12h14" {...stroke} />
  </>,
);
export const CheckIcon = svg(<path d="m4.5 12.5 5 5 10-11" {...stroke} />);
export const SearchIcon = svg(
  <>
    <circle cx="11" cy="11" r="6.5" {...stroke} />
    <path d="m16 16 4 4" {...stroke} />
  </>,
);
export const BackIcon = svg(
  <>
    <path d="M20 12H5" {...stroke} />
    <path d="m11 6-6 6 6 6" {...stroke} />
  </>,
);
export const SettingsIcon = svg(
  <>
    <circle cx="12" cy="12" r="3.2" {...stroke} />
    <path
      d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.1a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03z"
      {...stroke}
    />
  </>,
);
export const SubtitlesIcon = svg(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2.5" {...stroke} />
    <path d="M7 14h5M14.5 14H17M7 10.5h3M12.5 10.5H17" {...stroke} />
  </>,
);
export const AudioIcon = svg(
  <>
    <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z" {...stroke} />
    <path d="M16 9a4 4 0 0 1 0 6" {...stroke} />
    <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" {...stroke} />
  </>,
);
export const ForwardIcon = svg(
  <>
    <path d="M4 6v12l8-6z" fill="currentColor" />
    <path d="M13 6v12l8-6z" fill="currentColor" />
  </>,
);
export const RewindIcon = svg(
  <>
    <path d="M20 6v12l-8-6z" fill="currentColor" />
    <path d="M11 6v12l-8-6z" fill="currentColor" />
  </>,
);
export const ExternalIcon = svg(
  <>
    <path d="M14 4h6v6" {...stroke} />
    <path d="m20 4-9 9" {...stroke} />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" {...stroke} />
  </>,
);
export const StarIcon = svg(
  <path
    d="m12 3.6 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75L6.8 19.6l1-5.8-4.2-4.1 5.8-.85z"
    fill="currentColor"
  />,
);
export const FilmIcon = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" {...stroke} />
    <path d="M8 4v16M16 4v16M3 12h18M3 8h5M3 16h5M16 8h5M16 16h5" {...stroke} />
  </>,
);
