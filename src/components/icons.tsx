import type { SVGProps, ReactNode } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke" | "fill"> {
  size?: number;
  stroke?: number;
  fill?: string;
  children?: ReactNode;
  d?: string;
}

export const Icon = ({
  d,
  size = 16,
  stroke = 1.5,
  fill = "none",
  children,
  ...rest
}: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {d ? <path d={d} /> : children}
  </svg>
);

type P = Omit<IconProps, "d" | "children">;

export const I = {
  search: (p: P) => (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </Icon>
  ),
  home: (p: P) => <Icon {...p} d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z" />,
  cal: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  ),
  inbox: (p: P) => (
    <Icon {...p} d="M3 13l3-8h12l3 8M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6M3 13h5l1 3h6l1-3h5" />
  ),
  msg: (p: P) => (
    <Icon
      {...p}
      d="M21 12c0 4.4-4 8-9 8a10.6 10.6 0 0 1-4-.8L3 21l1.4-4.5A8 8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"
    />
  ),
  bed: (p: P) => (
    <Icon {...p}>
      <path d="M3 18V8M3 12h18v6M21 18v-4a3 3 0 0 0-3-3h-7v3" />
      <circle cx="7" cy="11" r="2" />
    </Icon>
  ),
  tag: (p: P) => (
    <Icon {...p}>
      <path d="M20 12l-8 8-9-9V3h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </Icon>
  ),
  plug: (p: P) => <Icon {...p} d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8zM12 17v5" />,
  chart: (p: P) => <Icon {...p} d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  setting: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  ),
  bell: (p: P) => <Icon {...p} d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0" />,
  plus: (p: P) => <Icon {...p} d="M12 5v14M5 12h14" />,
  chevR: (p: P) => <Icon {...p} d="M9 6l6 6-6 6" />,
  chevL: (p: P) => <Icon {...p} d="M15 6l-6 6 6 6" />,
  chevD: (p: P) => <Icon {...p} d="M6 9l6 6 6-6" />,
  chevU: (p: P) => <Icon {...p} d="M18 15l-6-6-6 6" />,
  filter: (p: P) => <Icon {...p} d="M3 5h18M6 12h12M10 19h4" />,
  more: (p: P) => (
    <Icon {...p}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </Icon>
  ),
  refresh: (p: P) => <Icon {...p} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />,
  check: (p: P) => <Icon {...p} d="M5 12l5 5 9-11" />,
  close: (p: P) => <Icon {...p} d="M6 6l12 12M18 6L6 18" />,
  warn: (p: P) => <Icon {...p} d="M12 3l10 18H2zM12 10v5M12 18v.01" />,
  info: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v.01M11 12h1v5h1" />
    </Icon>
  ),
  ai: (p: P) => (
    <Icon
      {...p}
      d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"
    />
  ),
  user: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Icon>
  ),
  arrowR: (p: P) => <Icon {...p} d="M5 12h14M13 6l6 6-6 6" />,
  arrowL: (p: P) => <Icon {...p} d="M19 12H5M11 6l-6 6 6 6" />,
  arrowU: (p: P) => <Icon {...p} d="M12 19V5M5 12l7-7 7 7" />,
  arrowD: (p: P) => <Icon {...p} d="M12 5v14M19 12l-7 7-7-7" />,
  globe: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  ),
  sun: (p: P) => (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </Icon>
  ),
  moon: (p: P) => <Icon {...p} d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" />,
  zap: (p: P) => <Icon {...p} d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  sparkle: (p: P) => (
    <Icon
      {...p}
      d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 17l.7 1.8L7.5 19.5l-1.8.7L5 22l-.7-1.8L2.5 19.5l1.8-.7zM18 15l.5 1.5L20 17l-1.5.5L18 19l-.5-1.5L16 17l1.5-.5z"
    />
  ),
  eye: (p: P) => (
    <Icon {...p}>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  ),
  edit: (p: P) => <Icon {...p} d="M3 21l4-1 11-11-3-3L4 17l-1 4zM14 6l3 3" />,
  star: (p: P) => (
    <Icon
      {...p}
      d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"
    />
  ),
  calCheck: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M9 16l2 2 4-4" />
    </Icon>
  ),
  external: (p: P) => (
    <Icon
      {...p}
      d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"
    />
  ),
  cc: (p: P) => (
    <Icon {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 11h18" />
    </Icon>
  ),
  paperclip: (p: P) => (
    <Icon
      {...p}
      d="M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"
    />
  ),
  send: (p: P) => <Icon {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  download: (p: P) => <Icon {...p} d="M12 3v12M6 11l6 6 6-6M4 21h16" />,
  link: (p: P) => (
    <Icon {...p}>
      <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </Icon>
  ),
};
