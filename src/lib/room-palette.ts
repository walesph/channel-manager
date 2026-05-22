const ROOM_PALETTE: Record<string, string> = {
  "스탠다드 더블": "#fde68a",
  "스탠다드 트윈": "#bfdbfe",
  "디럭스 더블": "#fbcfe8",
  "디럭스 트윈": "#bbf7d0",
  "스위트 킹": "#ddd6fe",
};

export function paletteFor(name: string): string {
  return ROOM_PALETTE[name] ?? "#e5e7eb";
}
