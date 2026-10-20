/*
 * Googlant by antquu (github.com/antquu)
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
};

export const SearchIcon = (p: P) => (
  <svg {...base} width={18} height={18} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const ArrowUpIcon = (p: P) => (
  <svg {...base} strokeWidth={2} width={16} height={16} {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);
export const ArrowRightIcon = (p: P) => (
  <svg {...base} strokeWidth={2} width={14} height={14} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ChevronLeftIcon = (p: P) => (
  <svg {...base} strokeWidth={2} width={14} height={14} {...p}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
export const ChevronRightIcon = (p: P) => (
  <svg {...base} strokeWidth={2} width={14} height={14} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base} width={16} height={16} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const SettingsIcon = (p: P) => (
  <svg {...base} width={18} height={18} {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m20 16-4.5-4.5L7 19.5" />
  </svg>
);
export const NewsIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v11.5H6.5A2.5 2.5 0 0 1 4 16V6.5a1 1 0 0 1 1-1Z" />
    <path d="M17.5 9.5H20v7a2 2 0 0 1-2 2M8 9h6M8 12.5h6M8 16h3.5" />
  </svg>
);
export const GlobeIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5S9.6 6 12 3.5Z" />
  </svg>
);
export const MapIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2Z" />
    <path d="M9 4.5v13M15 6.5v13" />
  </svg>
);
export const StoreIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9.5 5.5 4.5h13L20 9.5M4 9.5c0 1.4 1.1 2.5 2.7 2.5s2.6-1.1 2.6-2.5c0 1.4 1.1 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1 2.5 2.6 2.5S20 10.9 20 9.5M4 9.5h16" />
    <path d="M5.5 12v7.5h13V12M10 19.5v-4.5h4v4.5" />
  </svg>
);
export const ExternalIcon = (p: P) => (
  <svg {...base} width={14} height={14} {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" />
  </svg>
);
export const PinIcon = (p: P) => (
  <svg {...base} width={14} height={14} {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base} width={15} height={15} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const ShieldIcon = (p: P) => (
  <svg {...base} width={13} height={13} {...p}>
    <path d="M12 3.5 5 6.2v5.3c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6.2L12 3.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
export const SparkIcon = (p: P) => (
  <svg {...base} width={13} height={13} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </svg>
);
export const BotIcon = (p: P) => (
  <svg {...base} width={13} height={13} {...p}>
    <rect x="4.5" y="8" width="15" height="11" rx="3" />
    <path d="M12 4.5V8M9 13h.01M15 13h.01" />
  </svg>
);
