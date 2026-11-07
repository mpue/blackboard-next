/** Perfboard with a jumper wire: the app mark (same artwork as public/icon.svg). */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#1e1b4b" />
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#c8a35e" />
      {[16, 26, 38, 48].flatMap((x) => [16, 26, 38, 48].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="#3b2a12" />))}
      <path d="M16 48 V26 H38 V16 H48" fill="none" stroke="#4f46e5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="48" r="5" fill="#e5e7eb" stroke="#4f46e5" strokeWidth="2.5" />
      <circle cx="48" cy="16" r="5" fill="#e5e7eb" stroke="#4f46e5" strokeWidth="2.5" />
    </svg>
  );
}
