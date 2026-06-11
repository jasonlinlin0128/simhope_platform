/**
 * SimHope hub mark — the brand logo glyph.
 *
 * A central node with four satellites joined by gently bowed links ("hub of
 * tools / connecting AI to the floor"). This is the canonical vector; the same
 * shape backs `app/icon.svg` (favicon) and `app/opengraph-image.js` (share card).
 *
 * - Default: renders with the brand violet→indigo gradient (#a78bfa → #6366f1).
 * - Pass `color` (e.g. "#fff") for a solid monochrome mark — used inside the
 *   navbar's gradient tile. Solid mode emits no <defs>, so many instances can
 *   share a page without gradient-id collisions.
 *
 * No hooks → safe in both server and client components.
 */
export default function HubMark({
  size = 32,
  color,
  gradientId = "sh-hub-gradient",
  className = "",
  title,
}) {
  const paint = color ?? `url(#${gradientId})`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      {!color && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a78bfa" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
      )}
      <g fill="none" stroke={paint} strokeWidth="4.4" strokeLinecap="round">
        <path d="M50 50 Q41.9 34.3 24 26" />
        <path d="M50 50 Q66.6 45.4 78 30" />
        <path d="M50 50 Q60 66.4 80 74" />
        <path d="M50 50 Q33.9 59.1 26 78" />
      </g>
      <g fill={paint}>
        <circle cx="50" cy="50" r="11.5" />
        <circle cx="24" cy="26" r="6.5" />
        <circle cx="78" cy="30" r="6" />
        <circle cx="80" cy="74" r="7" />
        <circle cx="26" cy="78" r="5.5" />
      </g>
    </svg>
  );
}
