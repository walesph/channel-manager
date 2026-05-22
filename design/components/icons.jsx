/* global React */
// Inline SVG icons — Lucide-style 1.5px stroke. Pure JSX, no deps.
const Icon = ({ d, size = 16, stroke = 1.5, fill = 'none', children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d ? <path d={d}/> : children}
  </svg>
);

const I = {
  search:    (p) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></Icon>,
  home:      (p) => <Icon {...p}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2v-9z"/></Icon>,
  cal:       (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>,
  inbox:     (p) => <Icon {...p}><path d="M3 13l3-8h12l3 8M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6M3 13h5l1 3h6l1-3h5"/></Icon>,
  msg:       (p) => <Icon {...p}><path d="M21 12c0 4.4-4 8-9 8a10.6 10.6 0 0 1-4-.8L3 21l1.4-4.5A8 8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></Icon>,
  bed:       (p) => <Icon {...p}><path d="M3 18V8M3 12h18v6M21 18v-4a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="11" r="2"/></Icon>,
  tag:       (p) => <Icon {...p}><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/></Icon>,
  plug:      (p) => <Icon {...p}><path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8zM12 17v5"/></Icon>,
  chart:     (p) => <Icon {...p}><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></Icon>,
  setting:   (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Icon>,
  bell:      (p) => <Icon {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></Icon>,
  plus:      (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>,
  chevR:     (p) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>,
  chevL:     (p) => <Icon {...p}><path d="M15 6l-6 6 6 6"/></Icon>,
  chevD:     (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>,
  chevU:     (p) => <Icon {...p}><path d="M18 15l-6-6-6 6"/></Icon>,
  filter:    (p) => <Icon {...p}><path d="M3 5h18M6 12h12M10 19h4"/></Icon>,
  more:      (p) => <Icon {...p}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></Icon>,
  refresh:   (p) => <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></Icon>,
  check:     (p) => <Icon {...p}><path d="M5 12l5 5 9-11"/></Icon>,
  close:     (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>,
  warn:      (p) => <Icon {...p}><path d="M12 3l10 18H2zM12 10v5M12 18v.01"/></Icon>,
  info:      (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v.01M11 12h1v5h1"/></Icon>,
  ai:        (p) => <Icon {...p}><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7zM19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"/></Icon>,
  user:      (p) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Icon>,
  users:     (p) => <Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21 20a6.5 6.5 0 0 0-3.5-5.7"/></Icon>,
  arrowR:    (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>,
  arrowU:    (p) => <Icon {...p}><path d="M12 19V5M5 12l7-7 7 7"/></Icon>,
  arrowD:    (p) => <Icon {...p}><path d="M12 5v14M19 12l-7 7-7-7"/></Icon>,
  trend:     (p) => <Icon {...p}><path d="M3 17l6-6 4 4 7-9M14 6h7v7"/></Icon>,
  link:      (p) => <Icon {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></Icon>,
  edit:      (p) => <Icon {...p}><path d="M3 21l4-1 11-11-3-3L4 17l-1 4zM14 6l3 3"/></Icon>,
  trash:     (p) => <Icon {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/></Icon>,
  copy:      (p) => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></Icon>,
  download:  (p) => <Icon {...p}><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></Icon>,
  upload:    (p) => <Icon {...p}><path d="M12 21V9M6 13l6-6 6 6M4 3h16"/></Icon>,
  globe:     (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></Icon>,
  sun:       (p) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></Icon>,
  moon:      (p) => <Icon {...p}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></Icon>,
  star:      (p) => <Icon {...p}><path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/></Icon>,
  pin:       (p) => <Icon {...p}><path d="M12 2v6M9 8h6M11 8l-3 6h8l-3-6M12 14v8"/></Icon>,
  phone:     (p) => <Icon {...p}><path d="M22 16v3a2 2 0 0 1-2.2 2 19 19 0 0 1-8.3-2.9 19 19 0 0 1-6-6A19 19 0 0 1 2.6 3.8 2 2 0 0 1 4.6 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.7.7 2.5a2 2 0 0 1-.5 2.1L9.1 9.5a16 16 0 0 0 6 6l1.2-1.7a2 2 0 0 1 2.1-.5c.8.3 1.6.6 2.5.7a2 2 0 0 1 1.7 2z"/></Icon>,
  calCheck:  (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 16l2 2 4-4"/></Icon>,
  dot:       (p) => <Icon {...p}><circle cx="12" cy="12" r="2"/></Icon>,
  lock:      (p) => <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Icon>,
  drag:      (p) => <Icon {...p}><circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/></Icon>,
  flame:     (p) => <Icon {...p}><path d="M12 22a7 7 0 0 0 7-7c0-3-2-5-3-7-1 2-3 3-3 6 0-3-2-5-3-7-2 3-5 5-5 8a7 7 0 0 0 7 7z"/></Icon>,
  zap:       (p) => <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></Icon>,
  external:  (p) => <Icon {...p}><path d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></Icon>,
  cc:        (p) => <Icon {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 11h18"/></Icon>,
  sparkle:   (p) => <Icon {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5zM5 17l.7 1.8L7.5 19.5l-1.8.7L5 22l-.7-1.8L2.5 19.5l1.8-.7zM18 15l.5 1.5L20 17l-1.5.5L18 19l-.5-1.5L16 17l1.5-.5z"/></Icon>,
  send:      (p) => <Icon {...p}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></Icon>,
  paperclip: (p) => <Icon {...p}><path d="M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/></Icon>,
  win:       (p) => <Icon {...p}><circle cx="6" cy="6" r="1" fill="currentColor"/><circle cx="10" cy="6" r="1" fill="currentColor"/><circle cx="14" cy="6" r="1" fill="currentColor"/></Icon>,
  doubleR:   (p) => <Icon {...p}><path d="M7 6l6 6-6 6M13 6l6 6-6 6"/></Icon>,
  doubleL:   (p) => <Icon {...p}><path d="M17 6l-6 6 6 6M11 6l-6 6 6 6"/></Icon>,
  eye:       (p) => <Icon {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></Icon>,
  brand:     (p) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" stroke="none"/><path d="M8 16V8h2.5a2.5 2.5 0 0 1 0 5H8M16 8v8M14 12h4" stroke="white"/></Icon>,
};

window.I = I;
window.Icon = Icon;
