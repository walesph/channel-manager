import {
  PrismaClient,
  ChannelType,
  ChannelStatus,
  BookingStatus,
  PaymentStatus,
  BookingRequestType,
  BookingEventType,
  SyncOp,
  SyncResult,
  MessageSender,
} from "@prisma/client";

const prisma = new PrismaClient();

interface RoomTypeSeed {
  id: string;
  name: string;
  capacity: number;
  baseRate: number;
  bedType: string;
  sizeSqm: number;
  amenities: string[];
  rooms: string[];
}

const ROOM_TYPES: RoomTypeSeed[] = [
  { id: "std-double", name: "스탠다드 더블", capacity: 2, baseRate: 98000, bedType: "Double", sizeSqm: 22, amenities: ["wifi", "tv", "ac"], rooms: ["0501", "0502", "0606", "0607", "0701", "0702", "0801", "0802", "0901", "0902", "1001", "1002"] },
  { id: "std-twin", name: "스탠다드 트윈", capacity: 2, baseRate: 102000, bedType: "Twin", sizeSqm: 24, amenities: ["wifi", "tv", "ac"], rooms: ["0503", "0603", "0703", "0803", "0903", "1003", "1103", "1203", "1303", "1403"] },
  { id: "dlx-double", name: "디럭스 더블", capacity: 2, baseRate: 142000, bedType: "Queen", sizeSqm: 28, amenities: ["wifi", "tv", "ac", "minibar", "view"], rooms: ["0504", "0604", "0704", "0804", "0805", "0904", "1004", "1104", "1204", "1304", "1404", "1504", "1604", "1704"] },
  { id: "dlx-twin", name: "디럭스 트윈", capacity: 2, baseRate: 148000, bedType: "Twin", sizeSqm: 30, amenities: ["wifi", "tv", "ac", "minibar", "view"], rooms: ["0506", "0606", "0706", "0806", "0906", "1006", "1208", "1308", "1408", "1508"] },
  { id: "suite-king", name: "스위트 킹", capacity: 4, baseRate: 245000, bedType: "King", sizeSqm: 48, amenities: ["wifi", "tv", "ac", "minibar", "view", "lounge", "bath"], rooms: ["0902", "1102", "1202", "1302", "1402", "1502"] },
];

const CHANNELS: { type: ChannelType; status: ChannelStatus; lastSyncMinutesAgo: number }[] = [
  { type: ChannelType.airbnb, status: ChannelStatus.synced, lastSyncMinutesAgo: 1 },
  { type: ChannelType.booking, status: ChannelStatus.synced, lastSyncMinutesAgo: 1 },
  { type: ChannelType.agoda, status: ChannelStatus.syncing, lastSyncMinutesAgo: 2 },
  { type: ChannelType.trip, status: ChannelStatus.synced, lastSyncMinutesAgo: 1 },
  { type: ChannelType.direct, status: ChannelStatus.synced, lastSyncMinutesAgo: 1 },
  { type: ChannelType.fb, status: ChannelStatus.delayed, lastSyncMinutesAgo: 9 },
];

interface GuestSeed {
  name: string;
  email: string;
  phone: string;
  country: string;
  language: string;
}

const GUESTS: GuestSeed[] = [
  { name: "김도윤", email: "kim.doyun@gmail.com", phone: "+82 10-2384-7521", country: "KR", language: "ko" },
  { name: "佐藤美咲", email: "sato.misaki@example.jp", phone: "+81 90-1234-5678", country: "JP", language: "ja" },
  { name: "Michael Chen", email: "m.chen@example.cn", phone: "+86 138-0013-8000", country: "CN", language: "zh" },
  { name: "James Smith", email: "j.smith@example.com", phone: "+1 415-555-2384", country: "US", language: "en" },
  { name: "박서연", email: "park.seoyeon@gmail.com", phone: "+82 10-9876-5432", country: "KR", language: "ko" },
  { name: "Anna Larsson", email: "anna.l@example.se", phone: "+46 70-123-4567", country: "SE", language: "en" },
  { name: "Hans Müller", email: "hans.m@example.de", phone: "+49 30-12345678", country: "DE", language: "de" },
  { name: "田中健", email: "tanaka.ken@example.jp", phone: "+81 80-9999-8888", country: "JP", language: "ja" },
  { name: "Wei Chen", email: "wei.c@example.cn", phone: "+86 139-0013-9000", country: "CN", language: "zh" },
  { name: "이지현", email: "lee.jihyun@gmail.com", phone: "+82 10-1234-5678", country: "KR", language: "ko" },
];

interface NamedBookingSeed {
  guestIdx: number;
  channelType: ChannelType;
  externalRef: string;
  roomTypeId: string;
  ciOffset: number;
  nights: number;
  total: number;
  status: BookingStatus;
  payment: PaymentStatus;
  requests?: { type: BookingRequestType; label: string }[];
  message?: string;
}

const NAMED_BOOKINGS: NamedBookingSeed[] = [
  {
    guestIdx: 0,
    channelType: ChannelType.airbnb,
    externalRef: "ABNB-AX9421",
    roomTypeId: "dlx-twin",
    ciOffset: 0,
    nights: 3,
    total: 474000,
    status: BookingStatus.confirmed,
    payment: PaymentStatus.paid,
    requests: [
      { type: BookingRequestType.bed, label: "높은 층 객실 요청" },
      { type: BookingRequestType.checkin, label: "얼리 체크인 (가능 시)" },
      { type: BookingRequestType.dietary, label: "비건 조식" },
    ],
    message: "얼리 체크인 가능할까요?",
  },
  {
    guestIdx: 1,
    channelType: ChannelType.booking,
    externalRef: "BDC-2294117",
    roomTypeId: "dlx-double",
    ciOffset: 0,
    nights: 5,
    total: 790000,
    status: BookingStatus.confirmed,
    payment: PaymentStatus.paid,
    requests: [{ type: BookingRequestType.checkin, label: "조용한 객실" }],
  },
  { guestIdx: 2, channelType: ChannelType.agoda, externalRef: "AGD-7782940", roomTypeId: "std-twin", ciOffset: 0, nights: 2, total: 204000, status: BookingStatus.confirmed, payment: PaymentStatus.pending },
  { guestIdx: 3, channelType: ChannelType.direct, externalRef: "DIR-001939", roomTypeId: "suite-king", ciOffset: 0, nights: 4, total: 980000, status: BookingStatus.confirmed, payment: PaymentStatus.paid, requests: [{ type: BookingRequestType.note, label: "공항 픽업 (15:00 도착)" }] },
  { guestIdx: 4, channelType: ChannelType.trip, externalRef: "CTR-882938", roomTypeId: "std-double", ciOffset: 0, nights: 1, total: 102000, status: BookingStatus.confirmed, payment: PaymentStatus.paid },
  { guestIdx: 5, channelType: ChannelType.fb, externalRef: "FB-MSG-2937", roomTypeId: "dlx-double", ciOffset: 1, nights: 5, total: 740000, status: BookingStatus.confirmed, payment: PaymentStatus.pending },
  { guestIdx: 6, channelType: ChannelType.airbnb, externalRef: "ABNB-AX9420", roomTypeId: "std-double", ciOffset: 1, nights: 2, total: 196000, status: BookingStatus.confirmed, payment: PaymentStatus.paid },
  { guestIdx: 7, channelType: ChannelType.booking, externalRef: "BDC-2294115", roomTypeId: "std-twin", ciOffset: 1, nights: 3, total: 306000, status: BookingStatus.cancelled, payment: PaymentStatus.refunded },
  { guestIdx: 8, channelType: ChannelType.agoda, externalRef: "AGD-7782939", roomTypeId: "dlx-twin", ciOffset: 2, nights: 2, total: 296000, status: BookingStatus.confirmed, payment: PaymentStatus.paid },
  { guestIdx: 9, channelType: ChannelType.direct, externalRef: "DIR-001938", roomTypeId: "std-double", ciOffset: 2, nights: 3, total: 294000, status: BookingStatus.confirmed, payment: PaymentStatus.paid },
];

const RATE_PLANS = [
  { name: "Standard", refundable: true, modifier: 1.0 },
  { name: "Non-refundable", refundable: false, modifier: 0.9 },
] as const;

const CHANNEL_MOD: Record<ChannelType, number> = {
  airbnb: 1.0,
  booking: 0.95,
  agoda: 0.97,
  trip: 0.96,
  direct: 0.92,
  fb: 1.0,
  yanolja: 1.0,
  naver: 1.0,
};

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

// Deterministic PRNG so consecutive seeds give identical demo output
let rngSeed = 42;
function rand(): number {
  rngSeed = (rngSeed * 9301 + 49297) % 233280;
  return rngSeed / 233280;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

async function main() {
  console.log("Seeding Stayboard database…");

  await prisma.message.deleteMany();
  await prisma.thread.deleteMany();
  await prisma.savedReply.deleteMany();
  await prisma.bookingEvent.deleteMany();
  await prisma.bookingRequest.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.syncLog.deleteMany();
  await prisma.rate.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.channelMap.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.hotel.deleteMany();

  const hotel = await prisma.hotel.create({
    data: { name: "서울 라이트호텔", timezone: "Asia/Seoul", currency: "KRW" },
  });
  console.log(`  hotel: ${hotel.name}`);

  const roomTypes = await Promise.all(
    ROOM_TYPES.map((rt) =>
      prisma.roomType.create({
        data: {
          hotelId: hotel.id,
          name: rt.name,
          capacity: rt.capacity,
          baseRate: rt.baseRate,
          bedType: rt.bedType,
          sizeSqm: rt.sizeSqm,
          amenities: rt.amenities,
          rooms: { create: rt.rooms.map((number) => ({ number })) },
        },
        include: { rooms: true },
      })
    )
  );
  const roomTypeBySlug = new Map(ROOM_TYPES.map((rt, i) => [rt.id, roomTypes[i]]));
  console.log(`  room types: ${roomTypes.length}, rooms: ${ROOM_TYPES.reduce((s, r) => s + r.rooms.length, 0)}`);

  const ratePlansByRt = new Map<string, { id: string; name: string; modifier: number }[]>();
  for (const rt of roomTypes) {
    const created = await Promise.all(
      RATE_PLANS.map((rp) =>
        prisma.ratePlan.create({
          data: { roomTypeId: rt.id, name: rp.name, refundable: rp.refundable, modifier: rp.modifier },
        })
      )
    );
    ratePlansByRt.set(rt.id, created);
  }

  const now = new Date();
  const channels = await Promise.all(
    CHANNELS.map((c) =>
      prisma.channel.create({
        data: {
          hotelId: hotel.id,
          type: c.type,
          status: c.status,
          lastSyncAt: new Date(now.getTime() - c.lastSyncMinutesAgo * 60_000),
        },
      })
    )
  );
  const channelByType = new Map(channels.map((c) => [c.type, c]));
  console.log(`  channels: ${channels.length}`);

  for (const channel of channels) {
    if (channel.type === ChannelType.fb) continue;
    for (const rt of roomTypes) {
      await prisma.channelMap.create({
        data: { channelId: channel.id, roomTypeId: rt.id, externalId: `${channel.type.toUpperCase()}-${rt.name.replace(/\s/g, "")}` },
      });
    }
  }

  const inventoryStart = dateOnly(now);

  for (const rt of roomTypes) {
    const seed = ROOM_TYPES.find((r) => r.name === rt.name)!;
    const rows = Array.from({ length: 14 }, (_, i) => ({
      roomTypeId: rt.id,
      date: addDays(inventoryStart, i),
      available: Math.max(0, seed.rooms.length - 2),
      closed: false,
      minStay: 1,
    }));
    await prisma.inventory.createMany({ data: rows });
  }
  console.log(`  inventory: ${roomTypes.length * 14} rows`);

  let rateCount = 0;
  for (const rt of roomTypes) {
    const seed = ROOM_TYPES.find((r) => r.name === rt.name)!;
    const plans = ratePlansByRt.get(rt.id)!;
    for (let i = 0; i < 14; i++) {
      const date = addDays(inventoryStart, i);
      const dow = date.getUTCDay();
      const wkndF = dow === 5 || dow === 6 ? 1.18 : 1.0;
      for (const plan of plans) {
        for (const channel of channels) {
          const amount = Math.round(seed.baseRate * wkndF * plan.modifier * CHANNEL_MOD[channel.type]);
          await prisma.rate.create({
            data: { roomTypeId: rt.id, ratePlanId: plan.id, channelId: channel.id, date, amount },
          });
          rateCount++;
        }
      }
    }
  }
  console.log(`  rates: ${rateCount} rows`);

  const guests = await Promise.all(
    GUESTS.map((g) =>
      prisma.guest.create({
        data: { hotelId: hotel.id, name: g.name, email: g.email, phone: g.phone, country: g.country, language: g.language },
      })
    )
  );
  console.log(`  guests: ${guests.length}`);

  // ── Named (current) bookings with requests + events
  const namedBookingIds: string[] = [];
  for (const b of NAMED_BOOKINGS) {
    const checkIn = addDays(inventoryStart, b.ciOffset);
    const checkOut = addDays(checkIn, b.nights);
    const rt = roomTypeBySlug.get(b.roomTypeId)!;
    const room = rt.rooms[Math.floor(rand() * rt.rooms.length)];
    const created = new Date(checkIn.getTime() - 86_400_000);

    const booking = await prisma.booking.create({
      data: {
        hotelId: hotel.id,
        channelId: channelByType.get(b.channelType)!.id,
        externalRef: b.externalRef,
        guestId: guests[b.guestIdx].id,
        roomTypeId: rt.id,
        roomId: room.id,
        checkIn,
        checkOut,
        status: b.status,
        payment: b.payment,
        total: b.total,
        createdAt: created,
        requests: b.requests
          ? { create: b.requests.map((r) => ({ type: r.type, label: r.label })) }
          : undefined,
      },
    });
    namedBookingIds.push(booking.id);

    const events: { type: BookingEventType; occurredAt: Date; body: string | null }[] = [
      { type: BookingEventType.created, occurredAt: created, body: null },
    ];
    if (b.payment === PaymentStatus.paid) {
      events.push({ type: BookingEventType.payment_captured, occurredAt: created, body: `₩${b.total.toLocaleString()}` });
    }
    if (b.payment === PaymentStatus.refunded) {
      events.push({ type: BookingEventType.payment_refunded, occurredAt: created, body: `₩${b.total.toLocaleString()}` });
    }
    events.push({ type: BookingEventType.confirmation_sent, occurredAt: new Date(created.getTime() + 60_000), body: "auto" });
    if (b.message) {
      events.push({ type: BookingEventType.message_received, occurredAt: new Date(created.getTime() + 4 * 3600_000), body: b.message });
    }
    if (b.status === BookingStatus.cancelled) {
      events.push({ type: BookingEventType.cancelled, occurredAt: new Date(created.getTime() + 12 * 3600_000), body: null });
    }
    await prisma.bookingEvent.createMany({
      data: events.map((e) => ({ bookingId: booking.id, ...e })),
    });
  }
  console.log(`  named bookings: ${namedBookingIds.length}`);

  // ── Filler future bookings (next 14 days, for calendar density)
  const channelTypes: ChannelType[] = [ChannelType.airbnb, ChannelType.booking, ChannelType.agoda, ChannelType.trip, ChannelType.direct];
  let fillerCount = 0;
  for (let i = 0; i < 35; i++) {
    const rtSeed = pick(ROOM_TYPES);
    const rt = roomTypeBySlug.get(rtSeed.id)!;
    const room = rt.rooms[int(0, rt.rooms.length - 1)];
    const ciOffset = int(0, 12);
    const nights = int(1, 4);
    const checkIn = addDays(inventoryStart, ciOffset);
    const checkOut = addDays(checkIn, nights);
    const channelType = pick(channelTypes);
    const guest = guests[int(0, guests.length - 1)];
    const total = Math.round(rtSeed.baseRate * nights * (0.9 + rand() * 0.3));
    const created = new Date(checkIn.getTime() - (1 + int(0, 7)) * 86_400_000);

    await prisma.booking.create({
      data: {
        hotelId: hotel.id,
        channelId: channelByType.get(channelType)!.id,
        guestId: guest.id,
        roomTypeId: rt.id,
        roomId: room.id,
        checkIn,
        checkOut,
        status: BookingStatus.confirmed,
        payment: rand() < 0.85 ? PaymentStatus.paid : PaymentStatus.pending,
        total,
        createdAt: created,
        events: {
          create: [{ type: BookingEventType.created, occurredAt: created, body: null }],
        },
      },
    });
    fillerCount++;
  }
  console.log(`  filler bookings: ${fillerCount}`);

  // ── Historical bookings spread across last 6 months for the revenue chart
  let historicalCount = 0;
  for (let m = 6; m >= 1; m--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    // ~20-30 bookings per past month
    const count = int(20, 30);
    for (let i = 0; i < count; i++) {
      const dom = int(1, daysInMonth);
      const ci = dateOnly(new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), dom)));
      const nights = int(1, 5);
      const co = addDays(ci, nights);
      const rtSeed = pick(ROOM_TYPES);
      const rt = roomTypeBySlug.get(rtSeed.id)!;
      const channelType = pick(channelTypes.concat([ChannelType.fb]));
      const total = Math.round(rtSeed.baseRate * nights * (0.85 + rand() * 0.3));
      const created = new Date(ci.getTime() - (1 + int(0, 14)) * 86_400_000);

      await prisma.booking.create({
        data: {
          hotelId: hotel.id,
          channelId: channelByType.get(channelType)!.id,
          guestId: guests[int(0, guests.length - 1)].id,
          roomTypeId: rt.id,
          checkIn: ci,
          checkOut: co,
          status: BookingStatus.checked_out,
          payment: PaymentStatus.paid,
          total,
          createdAt: created,
        },
      });
      historicalCount++;
    }
  }
  console.log(`  historical bookings: ${historicalCount}`);

  // ── Sync log entries (recent 24h)
  const syncRows: { offsetMin: number; type: ChannelType; op: SyncOp; target: string; result: SyncResult; ms: number | null; note?: string }[] = [
    { offsetMin: -1, type: ChannelType.airbnb, op: SyncOp.push_inventory, target: "14 days × 5 rooms", result: SyncResult.success, ms: 312 },
    { offsetMin: -1, type: ChannelType.booking, op: SyncOp.push_rates, target: "14 days × 5 rooms", result: SyncResult.success, ms: 504 },
    { offsetMin: -2, type: ChannelType.agoda, op: SyncOp.pull_bookings, target: "3 new bookings", result: SyncResult.in_progress, ms: null },
    { offsetMin: -3, type: ChannelType.trip, op: SyncOp.push_inventory, target: "14 days × 5 rooms", result: SyncResult.success, ms: 218 },
    { offsetMin: -8, type: ChannelType.fb, op: SyncOp.pull_bookings, target: "6 bookings", result: SyncResult.warn, ms: 8420, note: "API timeout" },
    { offsetMin: -14, type: ChannelType.booking, op: SyncOp.rate_mismatch, target: "Deluxe Double 1/15", result: SyncResult.error, ms: null, note: "Resolved manually" },
    { offsetMin: -32, type: ChannelType.airbnb, op: SyncOp.pull_bookings, target: "2 new bookings", result: SyncResult.success, ms: 480 },
    { offsetMin: -62, type: ChannelType.direct, op: SyncOp.push_inventory, target: "14 days × 5 rooms", result: SyncResult.success, ms: 102 },
  ];
  for (const r of syncRows) {
    await prisma.syncLog.create({
      data: {
        channelId: channelByType.get(r.type)!.id,
        op: r.op,
        target: r.target,
        result: r.result,
        durationMs: r.ms ?? undefined,
        note: r.note,
        occurredAt: new Date(now.getTime() + r.offsetMin * 60_000),
      },
    });
  }
  console.log(`  sync log: ${syncRows.length} rows`);

  // ── Saved replies (hotel-wide template messages)
  await prisma.savedReply.createMany({
    data: [
      { hotelId: hotel.id, label: "체크인 안내", body: "안녕하세요! 체크인이 완료되었습니다. 객실은 1208호이며, Wi-Fi 비밀번호는 welcome2026입니다. 편한 시간 보내세요!" },
      { hotelId: hotel.id, label: "주차 안내", body: "지하 1층 주차장을 이용하실 수 있습니다 (1박 ₩15,000)." },
      { hotelId: hotel.id, label: "레이트 체크아웃", body: "14:00까지 레이트 체크아웃 가능합니다 (+₩20,000)." },
      { hotelId: hotel.id, label: "와이파이", body: "Wi-Fi: Lighthouse_Guest / Password: welcome2026" },
      { hotelId: hotel.id, label: "리뷰 요청", body: "이용해 주셔서 감사합니다! 머무신 경험을 짧은 리뷰로 공유해주시면 큰 도움이 됩니다 🙏" },
    ],
  });
  console.log(`  saved replies: 5 rows`);

  // ── Message threads (one per named guest, with mock conversation)
  interface ThreadSeed {
    guestIdx: number;
    channelType: ChannelType;
    unread: number;
    minutesAgo: number;
    messages: { sender: MessageSender; body: string; offsetMin: number }[];
  }
  const THREADS: ThreadSeed[] = [
    {
      guestIdx: 0,
      channelType: ChannelType.airbnb,
      unread: 1,
      minutesAgo: 41,
      messages: [
        { sender: MessageSender.system, body: "Airbnb를 통한 예약 (BK-2942)", offsetMin: -180 },
        { sender: MessageSender.guest, body: "안녕하세요! 1월 13일 예약했습니다.", offsetMin: -44 },
        { sender: MessageSender.guest, body: "비행기가 일찍 도착해서요, 혹시 얼리 체크인 가능할까요? 12시쯤 도착 예정이에요.", offsetMin: -41 },
      ],
    },
    {
      guestIdx: 1,
      channelType: ChannelType.booking,
      unread: 0,
      minutesAgo: 232,
      messages: [
        { sender: MessageSender.host, body: "안녕하세요 사토님, 예약 확인해드렸습니다. 안전한 여행 되세요!", offsetMin: -240 },
        { sender: MessageSender.guest, body: "감사합니다. 곧 뵙겠습니다.", offsetMin: -232 },
      ],
    },
    {
      guestIdx: 5,
      channelType: ChannelType.fb,
      unread: 2,
      minutesAgo: 318,
      messages: [
        { sender: MessageSender.guest, body: "Hi! Do you have rooms for next weekend (Jan 20-22)?", offsetMin: -322 },
        { sender: MessageSender.guest, body: "We are 2 adults, prefer a deluxe room with a view.", offsetMin: -318 },
      ],
    },
    {
      guestIdx: 2,
      channelType: ChannelType.agoda,
      unread: 1,
      minutesAgo: 390,
      messages: [
        { sender: MessageSender.guest, body: "주차장 이용 가능한가요?", offsetMin: -390 },
      ],
    },
    {
      guestIdx: 3,
      channelType: ChannelType.direct,
      unread: 1,
      minutesAgo: 465,
      messages: [
        { sender: MessageSender.guest, body: "Could I please modify my reservation to add one more night?", offsetMin: -465 },
      ],
    },
    {
      guestIdx: 4,
      channelType: ChannelType.trip,
      unread: 0,
      minutesAgo: 552,
      messages: [
        { sender: MessageSender.guest, body: "체크아웃 시간 연장 가능할까요? 오후 2시까지요.", offsetMin: -560 },
        { sender: MessageSender.host, body: "네, 14시까지 가능합니다. 추가 요금은 ₩20,000입니다.", offsetMin: -552 },
      ],
    },
  ];

  for (const t of THREADS) {
    const thread = await prisma.thread.create({
      data: {
        hotelId: hotel.id,
        guestId: guests[t.guestIdx].id,
        channelId: channelByType.get(t.channelType)!.id,
        unreadCount: t.unread,
        lastMessageAt: new Date(now.getTime() - t.minutesAgo * 60_000),
      },
    });
    await prisma.message.createMany({
      data: t.messages.map((m) => ({
        threadId: thread.id,
        sender: m.sender,
        body: m.body,
        createdAt: new Date(now.getTime() + m.offsetMin * 60_000),
      })),
    });
  }
  console.log(`  threads: ${THREADS.length}, messages: ${THREADS.reduce((s, t) => s + t.messages.length, 0)}`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
