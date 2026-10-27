// 24×24 outline icons used across host pages (paths from the design handoff).

export const ICONS = {
  overview: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z",
  schedule: "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  guests: "M16 20v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1a3 3 0 0 0-2-2.8M15.5 4.3a3.5 3.5 0 0 1 0 6.4",
  invitations: "M3 6h18v12H3zM3 7l9 6 9-6",
  responses: "M5 12.5l4.5 4.5L19 7.5",
  accommodation: "M3 18v-9M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5",
  meals: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11",
  transport: "M5 16V9l2-4h10l2 4v7M3 16h18v3H3zM7 12h.01M17 12h.01",
  reports: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
  chevronRight: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  star: "M12 3l2.5 5.5L20 9.5l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-1z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, path, size = 20, strokeWidth = 1.75, className }: { name?: IconName; path?: string; size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={path ?? (name ? ICONS[name] : "")} />
    </svg>
  );
}
