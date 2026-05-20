/* TradeStats gold circular logo */
export default function TSLogo({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer ring */}
      <circle cx="32" cy="32" r="30" fill="url(#gold_bg)" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="url(#gold_ring)" strokeWidth="2" />

      {/* Arrow / chart bars rising upward */}
      <rect x="13" y="38" width="7" height="10" rx="1.5" fill="url(#bar_color)" opacity="0.7" />
      <rect x="23" y="30" width="7" height="18" rx="1.5" fill="url(#bar_color)" opacity="0.85" />
      <rect x="33" y="22" width="7" height="26" rx="1.5" fill="url(#bar_color)" />

      {/* Upward arrow on top of tallest bar */}
      <polyline
        points="14,34 25,22 36,28 48,14"
        stroke="url(#line_color)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <polyline
        points="42,14 48,14 48,20"
        stroke="url(#line_color)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      <defs>
        <radialGradient id="gold_bg" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#2a1f00" />
          <stop offset="100%" stopColor="#1a1200" />
        </radialGradient>
        <linearGradient id="gold_ring" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#d97706" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="bar_color" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id="line_color" x1="14" y1="34" x2="48" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fcd34d" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  )
}
