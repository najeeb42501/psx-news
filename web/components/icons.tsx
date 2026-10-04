// Small inline SVG icons (no icon library needed). 24x24, stroke-based.
import type { SVGProps } from "react";

export type IconName =
  | "home" | "today" | "calendar" | "star" | "search" | "chart" | "coins" | "users" | "building"
  | "megaphone" | "globe" | "trending" | "file" | "share" | "external" | "bell" | "filter" | "x"
  | "arrow-right" | "check" | "plus" | "table" | "info";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  today: "M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  calendar: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z",
  search: "m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  coins: "M9 7c0 1.7 2.7 3 6 3s6-1.3 6-3-2.7-3-6-3-6 1.3-6 3Zm0 0v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7M3 13c0 1.7 2.7 3 6 3M3 13V9c0-1.7 2.7-3 6-3M3 13v4c0 1.7 2.7 3 6 3s6-1.3 6-3",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20",
  megaphone: "M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1Zm13-3a5 5 0 0 1 0 8",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  trending: "m3 17 6-6 4 4 8-8M15 7h6v6",
  file: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5",
  share: "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13",
  external: "M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  filter: "M3 5h18M6 12h12M10 19h4",
  x: "M18 6 6 18M6 6l12 12",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  check: "M20 6 9 17l-5-5",
  plus: "M12 5v14M5 12h14",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v-4M12 8h.01",
};

export function Icon({ name, className = "size-4", ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
