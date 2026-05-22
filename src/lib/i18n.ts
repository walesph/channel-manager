export type Lang = "ko" | "en" | "ja" | "zh";

/** Display label for the language switcher. */
export const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

/** All supported locales, ordered for the language switcher. */
export const LANGS: readonly Lang[] = ["ko", "en", "ja", "zh"] as const;

/**
 * Picks the best-fit Lang from an Accept-Language header value or a
 * `navigator.language` string. Tolerant of region tags (`en-US`, `zh-CN`).
 * Falls back to "ko" — Stayboard's primary market.
 */
export function detectLang(input: string | null | undefined): Lang {
  if (!input) return "ko";
  const tags = input.split(",").map((s) => s.trim().toLowerCase().split(";")[0]);
  for (const tag of tags) {
    const primary = tag.split("-")[0];
    if (primary === "ko") return "ko";
    if (primary === "en") return "en";
    if (primary === "ja") return "ja";
    if (primary === "zh") return "zh";
  }
  return "ko";
}

export const STR = {
  ko: {
    appName: "Stayboard",
    workspace: "서울 라이트호텔",
    nav: {
      dashboard: "대시보드",
      calendar: "캘린더",
      bookings: "예약",
      messages: "메시지",
      rooms: "객실 · 요금제",
      channels: "채널",
      revenue: "수익 분석",
      automations: "자동화",
      settings: "설정",
    },
    sect: { workspace: "워크스페이스", operations: "운영", growth: "성장", settings: "설정" },
    sync: { synced: "동기화됨", syncing: "동기화 중", error: "오류", delayed: "지연" },
    cmd: "검색이나 명령 입력…",
    today: "오늘",
    bulk: "벌크 편집",
    new: "신규",
    save: "저장",
    cancel: "취소",
    apply: "적용",
    confirm: "확인",
    rooms: "객실",
    nights: "박",
    occupancy: "점유율",
    adr: "ADR (객단가)",
    revpar: "RevPAR",
    revenue: "수익",
    bookings: "예약",
    arrivals: "체크인",
    departures: "체크아웃",
    inhouse: "재실",
    pendingMsgs: "응답 대기",
    syncIssues: "동기화 이슈",
    overbooking: "오버부킹",
    aiPrice: "AI 가격 추천",
    direct: "직접",
    homepage: "홈페이지",
  },
  en: {
    appName: "Stayboard",
    workspace: "Seoul Lighthouse Hotel",
    nav: {
      dashboard: "Dashboard",
      calendar: "Calendar",
      bookings: "Bookings",
      messages: "Messages",
      rooms: "Rooms & Rates",
      channels: "Channels",
      revenue: "Revenue",
      automations: "Automations",
      settings: "Settings",
    },
    sect: { workspace: "Workspace", operations: "Operations", growth: "Growth", settings: "Settings" },
    sync: { synced: "Synced", syncing: "Syncing", error: "Error", delayed: "Delayed" },
    cmd: "Search or type a command…",
    today: "Today",
    bulk: "Bulk edit",
    new: "New",
    save: "Save",
    cancel: "Cancel",
    apply: "Apply",
    confirm: "Confirm",
    rooms: "Rooms",
    nights: "Nights",
    occupancy: "Occupancy",
    adr: "ADR",
    revpar: "RevPAR",
    revenue: "Revenue",
    bookings: "Bookings",
    arrivals: "Arrivals",
    departures: "Departures",
    inhouse: "In-house",
    pendingMsgs: "Pending replies",
    syncIssues: "Sync issues",
    overbooking: "Overbooking",
    aiPrice: "AI price suggestions",
    direct: "Direct",
    homepage: "Homepage",
  },
  ja: {
    appName: "Stayboard",
    workspace: "ソウル ライトハウスホテル",
    nav: {
      dashboard: "ダッシュボード",
      calendar: "カレンダー",
      bookings: "予約",
      messages: "メッセージ",
      rooms: "客室・料金",
      channels: "チャネル",
      revenue: "収益分析",
      automations: "自動化",
      settings: "設定",
    },
    sect: { workspace: "ワークスペース", operations: "運営", growth: "成長", settings: "設定" },
    sync: { synced: "同期済み", syncing: "同期中", error: "エラー", delayed: "遅延" },
    cmd: "検索またはコマンドを入力…",
    today: "今日",
    bulk: "一括編集",
    new: "新規",
    save: "保存",
    cancel: "キャンセル",
    apply: "適用",
    confirm: "確認",
    rooms: "客室",
    nights: "泊",
    occupancy: "稼働率",
    adr: "ADR",
    revpar: "RevPAR",
    revenue: "収益",
    bookings: "予約",
    arrivals: "チェックイン",
    departures: "チェックアウト",
    inhouse: "滞在中",
    pendingMsgs: "返信待ち",
    syncIssues: "同期エラー",
    overbooking: "オーバーブッキング",
    aiPrice: "AI価格提案",
    direct: "直接",
    homepage: "ホームページ",
  },
  zh: {
    appName: "Stayboard",
    workspace: "首尔灯塔酒店",
    nav: {
      dashboard: "仪表盘",
      calendar: "日历",
      bookings: "预订",
      messages: "消息",
      rooms: "房型与价格",
      channels: "渠道",
      revenue: "收益分析",
      automations: "自动化",
      settings: "设置",
    },
    sect: { workspace: "工作区", operations: "运营", growth: "增长", settings: "设置" },
    sync: { synced: "已同步", syncing: "同步中", error: "错误", delayed: "延迟" },
    cmd: "搜索或输入命令…",
    today: "今天",
    bulk: "批量编辑",
    new: "新建",
    save: "保存",
    cancel: "取消",
    apply: "应用",
    confirm: "确认",
    rooms: "房间",
    nights: "晚",
    occupancy: "入住率",
    adr: "ADR",
    revpar: "RevPAR",
    revenue: "收益",
    bookings: "预订",
    arrivals: "到达",
    departures: "离店",
    inhouse: "在住",
    pendingMsgs: "待回复",
    syncIssues: "同步问题",
    overbooking: "超额预订",
    aiPrice: "AI 定价建议",
    direct: "直销",
    homepage: "官网",
  },
} as const;

export type ChannelId = "airbnb" | "booking" | "agoda" | "trip" | "direct" | "fb";
export type ChannelStatus = "synced" | "syncing" | "delayed" | "error";

export interface ChannelDef {
  id: ChannelId;
  name: string;
  short: string;
  color: string;
  cls: string;
  status: ChannelStatus;
}

export const CHANNELS: ChannelDef[] = [
  { id: "airbnb", name: "Airbnb", short: "AB", color: "var(--ch-airbnb)", cls: "ch-dot-airbnb", status: "synced" },
  { id: "booking", name: "Booking.com", short: "BC", color: "var(--ch-booking)", cls: "ch-dot-booking", status: "synced" },
  { id: "agoda", name: "Agoda", short: "AG", color: "var(--ch-agoda)", cls: "ch-dot-agoda", status: "syncing" },
  { id: "trip", name: "Trip.com", short: "TR", color: "var(--ch-trip)", cls: "ch-dot-trip", status: "synced" },
  { id: "direct", name: "Homepage", short: "HP", color: "var(--ch-direct)", cls: "ch-dot-direct", status: "synced" },
  { id: "fb", name: "Facebook", short: "FB", color: "var(--ch-fb)", cls: "ch-dot-fb", status: "delayed" },
];

export const channelById = (id: string): ChannelDef | undefined =>
  CHANNELS.find((c) => c.id === id);
