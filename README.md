# Handoff: Stayboard — Channel Manager (호텔 채널 매니저 SaaS)

## Overview
**Stayboard**는 호텔/숙박 운영자를 위한 채널 매니저 + PMS 통합 SaaS입니다. 여러 OTA 채널(Airbnb, Booking.com, Agoda, Trip.com, 야놀자, Naver 등)을 한 화면에서 관리하면서 객실 재고/요금/예약/메시지를 일원화하고, AI 기반 가격 추천을 제공합니다.

이 핸드오프 패키지는 9개 화면(7개 데스크톱 + 2개 모바일)의 hi-fi 디자인을 포함합니다.

## About the Design Files
이 번들에 포함된 파일들은 **HTML로 만들어진 디자인 레퍼런스**입니다 — 의도된 모양과 동작을 보여주는 프로토타입이며, 그대로 복사해 프로덕션으로 보낼 코드가 아닙니다.

작업의 목표는 **이 HTML 디자인들을 타깃 코드베이스의 환경에서 재구현**하는 것입니다 (React, Vue, SvelteKit, SwiftUI, native 등). 기존 코드베이스가 있다면 그쪽의 패턴/디자인 시스템/라이브러리를 따르세요. 신규 프로젝트라면 아래 "Recommended Stack" 섹션을 참고해 가장 적합한 프레임워크를 선택하세요.

## Fidelity
**High-fidelity (hifi)** — 최종 색상, 타이포그래피, 간격, 인터랙션이 모두 정의된 픽셀 단위 목업입니다. 개발자는 코드베이스의 기존 라이브러리/컴포넌트로 이 UI를 픽셀 단위로 재현해야 합니다.

단, 다음은 placeholder 상태이므로 실제 데이터/API로 대체 필요:
- 모든 게스트 이름, 예약번호, 가격, 수익 숫자는 mock 데이터
- 채널 로고/아이콘은 SVG로 그려져 있으며 실제 브랜드 자산 교체 필요
- AI 가격 추천 텍스트는 시연용

---

## Recommended Stack (신규 프로젝트인 경우)

| Layer | 추천 | 이유 |
|---|---|---|
| **Frontend** | Next.js 15 (App Router) + TypeScript | SSR + 정적 생성 + API routes 통합 |
| **Styling** | Tailwind CSS + CSS Variables | tokens.css 변수를 그대로 매핑 가능 |
| **UI 컴포넌트** | shadcn/ui 또는 Radix Primitives | 캘린더/모달/팝오버 빌트인 |
| **상태 관리** | TanStack Query (서버) + Zustand (클라이언트) | 채널 동기화 polling/refetch에 적합 |
| **DB** | PostgreSQL + Prisma | 예약/객실/채널/요금 관계 모델링 |
| **실시간** | Pusher 또는 Supabase Realtime | 채널 동기화 알림, 메시지 인박스 |
| **인증** | Clerk 또는 NextAuth | 멀티테넌트(호텔별) 지원 |
| **결제** | Stripe Connect | 호텔에 정산 |
| **국제화** | next-intl | KO/EN 토글 (프로토타입에 구현됨) |
| **차트** | Recharts 또는 Visx | 수익 분석 화면 |
| **호스팅** | Vercel + Supabase | MVP 단계 |

---

## Screens / Views

전체 디자인은 design canvas 형식으로 한 페이지에 담겨 있습니다 (`design/Channel Manager.html`). 캔버스에서 zoom/pan 가능하며, 각 artboard 카드 클릭 시 풀스크린으로 볼 수 있습니다.

### 섹션 구성
- **01 · Core operations** — 대시보드, 캘린더, 예약, 메시지
- **02 · Setup & growth** — 채널 연동, 객실/요금제, 수익 분석
- **03 · Mobile** — iOS 모바일 뷰 2화면

---

### 1. Dashboard (대시보드)
**Source**: `design/components/dashboard.jsx`

**Purpose**: 호텔 운영자가 아침에 가장 먼저 보는 화면. 오늘 점유율/수익/도착 손님/처리 필요 항목을 한눈에 확인.

**Layout** (1440 × 900):
- 상단: 4개 KPI 카드 (4-column grid, gap 16px)
  - 점유율 / ADR (객단가) / RevPAR / 오늘 예약
  - 각 카드: 큰 숫자 + 7일 sparkline + 전주 대비 변화율
- 중앙 좌: 주의 필요 알림 리스트 (5-7개)
  - 오버부킹, 채널 동기화 오류, 응답 대기 메시지, 결제 실패
- 중앙 우: AI 가격 추천 패널 — 향후 7일 객실별 추천 ADR
- 하단 좌: 오늘 체크인 테이블 (게스트명, 객실, 채널 chip, 결제 상태)
- 하단 우: 채널 믹스 (도넛 + 채널별 점유율 막대)

**Components**:
- KPI Card: `card` + 32px 큰 숫자 (font-num) + 11px tracker 라벨 + sparkline SVG
- Sparkline: 60×24 SVG, stroke 1.5px, color = accent
- Alert row: 좌측 상태 dot (warn/bad/info), 제목 + 설명, 우측 시간 + 액션 버튼
- AI suggestion row: 객실 thumbnail + 현재가 → 추천가 (화살표) + ▲▼ % + "적용" 버튼

---

### 2. Calendar (캘린더 — 핵심 화면)
**Source**: `design/components/calendar.jsx`

**Purpose**: 객실 타입 × 날짜 그리드에서 재고/요금/예약을 한 번에 관리. 드래그 셀 선택 후 벌크 편집이 핵심 인터랙션.

**Layout** (1600 × 900):
- 상단 툴바: 날짜 네비게이터, 객실 타입 필터, 채널 필터, 뷰 토글 (Inventory / Rate / Restrictions), "벌크 편집" 버튼
- 좌측 컬럼 (180px): 객실 타입 목록 (Standard Twin, Deluxe Double, Suite, ...)
  - 각 행 아래에 채널별 가격 sub-row (Airbnb, Booking.com, Agoda 등)
- 메인 그리드: 14일 × 객실 타입
  - 셀 (96 × 32px): 좌측 상단 = 가용 객실 수 / 우측 하단 = 가격
  - 색상 코딩:
    - 흰색 = 정상
    - `--cal-blocked` (옅은 빨강) = 마감
    - `--cal-booked` (옅은 파랑) = 예약 있음
    - `--cal-direct` (옅은 보라) = 직접 예약
    - 빨간 테두리 = 오버부킹 경고 (예: 1/15 디럭스 더블)
  - 예약 막대 오버레이: 게스트명 + 채널 dot, 셀 위에 절대 위치
- 드래그로 셀 다중 선택 → 팝오버 벌크 편집 (가격 / 재고 / 마감 / 최소박수)

**Interactions**:
- `mousedown` on cell → `mousemove` → 사각 선택 영역 그리기
- `mouseup` → 팝오버 표시 (선택된 셀 수, 객실 타입, 날짜 범위 요약 + 입력 필드)
- 오늘 칼럼: `border-left: 2px solid var(--cal-today-bd)`
- 주말 칼럼: `background: var(--cal-weekend)`

**State**:
```ts
type CellSelection = { roomTypeId: string; date: Date; channelId?: string }[];
type BulkEdit = { rate?: number; available?: number; closed?: boolean; minStay?: number };
```

---

### 3. Bookings (예약 인박스 + 상세)
**Source**: `design/components/bookings.jsx`

**Layout** (1440 × 900) — 2-pane:
- **좌측 (380px)**: 예약 리스트
  - 필터 칩: 전체 / 예정 / 재실 / 출발 / 취소
  - 검색 input
  - 예약 카드: 게스트 이니셜 아바타 + 이름 + 채널 chip + 체크인 날짜 + 객실 + 결제 상태 pill
- **우측 (flex-1)**: 선택된 예약 상세
  - 헤더: 게스트명, 예약번호 (mono), 채널, "메시지 보내기" 버튼
  - Stay 정보: 체크인-체크아웃 (큰 글자), 박수, 객실, 인원
  - 청구서 테이블: 객실료 × N박, 청소비, 세금, 총액
  - 결제 카드: 결제 수단, 상태 (paid/pending/failed), 환불 버튼
  - 활동 타임라인: 예약 생성 → 결제 → 메시지 → 체크인 (시간 + 채널 출처)
  - 노트 영역 (textarea)

---

### 4. Messages (통합 인박스)
**Source**: `design/components/messages.jsx`

**Layout** (1440 × 900) — 3-pane:
- **좌측 (280px)**: 스레드 리스트
  - 필터: 전체 / 미응답 / 멘션 / 자동화
  - 각 스레드: 아바타 + 이름 + 채널 dot + 마지막 메시지 미리보기 + 시간
  - 미응답 = 좌측 파란 dot
- **중앙 (flex-1)**: 대화창
  - 메시지 버블 (자기 = 우측 accent, 상대 = 좌측 회색)
  - 시스템 메시지 = 중앙 가는 글씨 (예: "Booking.com을 통한 예약")
  - 하단 입력: textarea + AI 답장 추천 버튼 + 저장된 답변 + 첨부 + 보내기
- **우측 (320px)**: 컨텍스트 패널
  - 게스트 카드: 이름, 국적 flag, 언어, 총 예약 수, "단골" 배지
  - 현재 예약 요약
  - 저장된 답변 리스트 (체크인 안내, Wifi 비밀번호 등)

---

### 5. Channels (채널 연동 설정)
**Source**: `design/components/channels.jsx`

**Layout** (1440 × 900):
- 상단: 종합 동기화 상태 (모든 채널 OK / 1개 오류)
- 중앙: 6개 채널 카드 그리드 (3 columns)
  - 카드 구성: 채널 로고 (SVG placeholder) + 이름 + 동기화 상태 pill + 마지막 동기화 시간 + 매핑된 객실 수 + "설정" / "동기화 지금" 버튼
  - 상태별 색상:
    - 동기화됨: `--ok` (녹색)
    - 동기화 중: `--info` (파랑) + spinner
    - 오류: `--bad` (빨강)
    - 지연: `--warn` (주황)
- 하단: 동기화 로그 테이블 (시간, 채널, 액션, 결과)
- "채널 추가" 버튼 → 모달 (야놀자, 여기어때, Naver 예약, Kakao 등 한국 채널 포함)

---

### 6. Rooms & Rates (객실 · 요금제)
**Source**: `design/components/rooms-revenue.jsx` (rooms 부분)

**Layout** (1440 × 900):
- 좌측 (240px): 객실 타입 리스트 (Standard Twin, Deluxe Double, Suite ...)
- 우측: 선택된 객실 타입 상세
  - 사진 갤러리 (placeholder 박스)
  - 기본 정보: 면적, 인원, 침대, 어메니티 칩
  - **채널별 요금 매트릭스** (테이블): 행 = 채널, 열 = 요금제 (Standard / Non-refundable / Member), 셀 = 가격 + commission %
  - 정책: 환불 정책, 최소박수, 최대박수, 어린이 정책
  - 프로모션: 활성 프로모션 카드 (예: "조기 예약 15% 할인 — 30일 전")

---

### 7. Revenue (수익 분석)
**Source**: `design/components/rooms-revenue.jsx` (revenue 부분)

**Layout** (1440 × 900):
- 상단: 4개 KPI (총수익, 수수료 차감 후 순수익, 평균 ADR, 환불액)
- 중앙: 6개월 stacked bar chart (채널별)
  - x: 월, y: 매출, stack: 채널 색상
- 하단 좌: 채널별 수익성 테이블 (수수료율, 총수익, 순수익, 환산 ADR)
- 하단 우: 국가별 수익 (flag + 국가명 + 막대)

---

### 8. Mobile · Dashboard
**Source**: `design/components/mobile.jsx`

**Frame**: iOS 26 device frame (400 × 870)

**Layout**:
- iOS 상태바 (시간, 신호, 배터리 — frame이 자동 처리)
- 헤더: 호텔명 + 알림 종 아이콘
- 2 × 2 KPI 그리드 (점유율, ADR, 예약, 수익)
- 알림 리스트 (3-4개)
- 오늘 체크인 카드 (수직 스택)
- 하단 탭바 (대시보드 / 캘린더 / 예약 / 메시지 / 더보기)

---

### 9. Mobile · Calendar
**Source**: `design/components/mobile.jsx`

**Layout**:
- 헤더: 월 표시 + 좌우 화살표
- 7일 가로 스크롤 그리드 × 객실 타입 (수직)
- 셀 탭 → 하단 시트 (가격/재고 편집)
- 하단 탭바

---

## Interactions & Behavior

### Calendar 드래그 선택
1. `onMouseDown` on cell → `setDragStart({row, col})`
2. `onMouseMove` → `setDragEnd({row, col})`, 사각 영역 계산해서 `selected` 셀 set
3. `onMouseUp` → 팝오버 위치 계산해서 표시
4. ESC → 선택 해제, 팝오버 닫기

### Tweaks Panel (디자인 검토용 — 프로덕션에서는 제거)
- 언어 KO/EN 토글
- 라이트/다크 테마
- 강조색 4종 (Indigo / Emerald / Rose / Slate)
- 행 밀도 3단계 (tight / normal / loose)
프로덕션에서는 사용자 설정으로 옮기거나 제거.

### 채널 동기화 polling
- 30초마다 백엔드에 동기화 상태 GET
- 실시간 알림은 WebSocket/Pusher 사용 권장

### 키보드 단축키 (디자인에 표시됨)
- `⌘K` — 명령 팔레트 (검색)
- `C` — 캘린더로 이동
- `B` — 예약으로 이동
- `M` — 메시지로 이동
- `N` — 신규 예약 생성

---

## State Management 모델

```ts
// 도메인 타입 (Prisma 스키마 기반 권장)
type Hotel       = { id, name, timezone, currency, ... };
type RoomType    = { id, hotelId, name, capacity, baseRate, ... };
type Room        = { id, roomTypeId, number, ... };
type Channel     = { id, hotelId, type: 'airbnb'|'booking'|..., status, lastSync, credentials };
type ChannelMap  = { channelId, roomTypeId, externalId, ratePlanMap };
type RatePlan    = { id, roomTypeId, name, refundable, modifier };
type Inventory   = { roomTypeId, date, available, closed, minStay };
type Rate        = { roomTypeId, ratePlanId, channelId, date, amount };
type Booking     = { id, channelId, externalRef, guestId, roomTypeId, checkIn, checkOut, status, total };
type Guest       = { id, name, email, phone, country, language };
type Message     = { id, threadId, sender, body, createdAt, channel };
type Thread      = { id, hotelId, guestId, channelId, lastMessageAt, unread };
```

### 주요 데이터 흐름
1. **채널 → Stayboard (인바운드)**: 채널 webhook/polling → Booking 생성 → 알림
2. **Stayboard → 채널 (아웃바운드)**: 가격/재고 변경 → 모든 매핑된 채널에 push
3. **충돌 감지**: 같은 객실에 겹치는 예약 → 오버부킹 경고

---

## Design Tokens

전체 토큰은 `design/styles/tokens.css`에 CSS variables로 정의되어 있습니다. Tailwind config로 변환 권장.

### Colors — Neutral scale (warm-cool slate)
```
--c-0:   #ffffff
--c-25:  #fafafa
--c-50:  #f6f6f7
--c-75:  #f1f1f3
--c-100: #ebebee
--c-150: #e1e1e6
--c-200: #d4d4da
--c-300: #b8b8c0
--c-400: #8e8e98
--c-500: #6c6c76
--c-600: #4f4f59
--c-700: #363640
--c-800: #1f1f26
--c-900: #131318
--c-950: #0a0a0e
```

### Accent
- Primary: `#4f46e5` (Indigo 600)
- Hover: `#4338ca`
- Soft bg: `#eef2ff`
- Border: `#c7d0fe`
- Text: `#3730a3`

### Semantic
- OK: `#16a34a` / soft `#ecfdf5`
- Warn: `#ea580c` / soft `#fff7ed`
- Bad: `#dc2626` / soft `#fef2f2`
- Info: `#0284c7` / soft `#f0f9ff`

### Channel brand colors
```
--ch-airbnb:  #ff385c
--ch-booking: #003580
--ch-agoda:   #d92d27
--ch-trip:    #287dfa
--ch-direct:  #18181b
--ch-fb:      #1877f2
```

### Typography
- Sans: **Pretendard Variable** (한글) + **Inter** (영문) fallback to system
- Mono: **JetBrains Mono**
- Numerics: Inter with `font-variant-numeric: tabular-nums`

### Type scale
```
--fs-xs:  11px
--fs-sm:  12px
--fs-md:  13px  (base)
--fs-lg:  14px
--fs-xl:  16px
--fs-2xl: 18px
--fs-3xl: 22px
--fs-4xl: 28px
--fs-5xl: 36px
```

### Spacing scale
4px-based: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 20, `--s-6` 24, `--s-8` 32, `--s-10` 40, `--s-12` 48

### Radii
- xs: 4px / sm: 6px / md: 8px / lg: 12px / xl: 16px

### Shadows
```
--shadow-1:   0 1px 2px rgba(15,15,20,.04), 0 1px 1px rgba(15,15,20,.03)
--shadow-2:   0 4px 12px rgba(15,15,20,.06), 0 1px 2px rgba(15,15,20,.04)
--shadow-pop: 0 12px 32px -8px rgba(15,15,20,.18), 0 4px 12px rgba(15,15,20,.08)
```

### Layout constants
- Sidebar width: 232px
- Topbar height: 48px
- Default row height: 32px (28px tight)

### Dark mode
완전한 다크 모드 토큰이 `.theme-dark` 클래스 아래 정의되어 있습니다. `prefers-color-scheme` 또는 사용자 토글에 매핑하세요.

---

## i18n — 한/영 문자열

`design/components/i18n.jsx`에 KO/EN 사전이 있습니다. next-intl/i18next로 옮길 때 키 구조를 그대로 사용 가능:

```ts
STR.ko.nav.dashboard  // '대시보드'
STR.en.nav.dashboard  // 'Dashboard'
STR.ko.occupancy      // '점유율'
```

---

## Channel API 연동 — 가장 어려운 부분 ⚠️

각 채널의 연동 방식과 난이도:

| 채널 | API 방식 | 비고 |
|---|---|---|
| **Booking.com** | XML Connectivity API | 파트너 승인 필요, 수개월 소요 |
| **Airbnb** | Channel Manager API | 인증 호스트 자격 필요, iCal로 시작 가능 |
| **Agoda** | YCS API | 파트너 계약 필요 |
| **Trip.com (Ctrip)** | Hotel Connectivity API | 별도 신청 |
| **야놀자/여기어때** | 한국 PMS 사를 통한 간접 연동만 가능 | Hostaway, EzPMS 같은 미들웨어 필요 |
| **Naver 예약** | 비즈니스 API | 신청 필요 |
| **Kakao** | 톡채널 API | 메시지만 가능 |

**현실적 시작점**: **Hostaway / SiteMinder / RateGain** 같은 채널 매니저 미들웨어 API를 1개 통합해 다수 OTA 커버리지를 확보하는 것이 빠릅니다.

---

## Assets

### 사용된 폰트
- Pretendard Variable (Google Fonts via `https://fonts.googleapis.com/css2?family=Pretendard+Variable...`)
- Inter (rsms.me/inter)
- JetBrains Mono (Google Fonts)

### 아이콘
- 인라인 SVG로 자체 그렸습니다 (`design/components/icons.jsx`)
- 프로덕션에서는 **Lucide React** 또는 **Heroicons**로 교체 권장 (더 풍부함)

### 채널 로고
- 모든 채널 로고는 placeholder SVG 또는 텍스트로 표현되어 있습니다
- 실제 브랜드 자산을 각 채널 파트너 가이드라인에 맞춰 사용 필요

### 이미지
- 객실 사진 등 실사 이미지는 모두 grey placeholder 박스로 표시
- 프로덕션은 Cloudinary/UploadThing/S3 같은 이미지 호스팅 사용 권장

---

## Files in this bundle

```
design_handoff_channel_manager/
├── README.md                          # 이 파일
└── design/
    ├── Channel Manager.html           # 메인 디자인 캔버스 (열어서 확인)
    ├── styles/
    │   └── tokens.css                 # 모든 디자인 토큰
    ├── design-canvas.jsx              # 캔버스 래퍼 (검토용, 프로덕션 X)
    ├── ios-frame.jsx                  # 모바일 iOS 프레임 (검토용, 프로덕션 X)
    ├── tweaks-panel.jsx               # 디자인 토글 패널 (검토용, 프로덕션 X)
    └── components/
        ├── i18n.jsx                   # KO/EN 사전 + 채널 정의
        ├── icons.jsx                  # 인라인 SVG 아이콘
        ├── sidebar.jsx                # 좌측 사이드바
        ├── topbar.jsx                 # 상단 바 + 명령 팔레트
        ├── dashboard.jsx              # 대시보드 화면
        ├── calendar.jsx               # 캘린더 그리드 + 벌크 편집
        ├── bookings.jsx               # 예약 인박스 + 상세
        ├── messages.jsx               # 통합 메시지 인박스
        ├── channels.jsx               # 채널 연동 설정
        ├── rooms-revenue.jsx          # 객실/요금제 + 수익 분석
        └── mobile.jsx                 # 모바일 대시보드 + 캘린더
```

---

## Suggested Implementation Order (MVP 4-Phase)

### Phase 1 — Foundation (3-4주)
1. Next.js 프로젝트 셋업 + Tailwind + tokens.css 변수 매핑
2. Prisma 스키마 + PostgreSQL (Hotel, RoomType, Inventory, Rate, Booking)
3. 인증 (Clerk, 호텔별 멀티테넌트)
4. **객실/요금제 CRUD** 화면 (mock data, 채널 연동 X)
5. **캘린더 그리드** (드래그 선택 + 벌크 편집, 단일 채널)
6. **대시보드** (KPI, 차트는 Recharts)

### Phase 2 — 첫 채널 연동 (4주)
1. **Booking.com** 또는 **Airbnb iCal** 1개로 시작
2. 인바운드 booking ingestion → DB
3. 아웃바운드 가격/재고 push
4. 채널 동기화 상태 화면
5. **예약 인박스 + 상세**

### Phase 3 — 메시지 + 자동화 (3주)
1. **통합 메시지 인박스** (저장된 답변, AI 답장 추천)
2. 자동 메시지 (체크인 안내, 리뷰 요청)
3. webhook → 실시간 업데이트

### Phase 4 — 성장 기능 (3주)
1. **수익 분석** + 채널별 P&L
2. **AI 가격 추천** (간단한 룰 엔진 → 점차 ML)
3. 추가 채널 (야놀자, Naver 등)
4. **모바일 PWA** 또는 React Native

---

## Questions for the Developer to Resolve

이 디자인을 구현하기 전에 product owner와 확인할 사항:

1. **타깃 시장**: 한국 호텔 / 글로벌 호텔 / 게스트하우스/펜션 — 누구를 우선?
2. **호텔 규모**: 5-20실 소형 / 20-100실 중형 / 100+ 대형 — UX 밀도가 다름
3. **기존 PMS**: 사용자가 다른 PMS를 쓰고 있는지? Stayboard만으로 충분한지?
4. **결제 흐름**: 호텔이 직접 결제 받는지, Stayboard가 PG 역할을 하는지?
5. **언어**: KO/EN 외에 일본어/중국어 필요한가? (디자인은 KO/EN만 준비됨)
6. **모바일 우선순위**: 모바일 앱이 day-1 필요한가, 웹 PWA로 충분한가?

---

## Notes for Claude Code

이 패키지를 Claude Code에 넘길 때:

```
@README.md 를 먼저 읽고,
@design/Channel\ Manager.html 을 브라우저에서 열어서 디자인 확인한 다음,
@design/styles/tokens.css 의 모든 토큰을 Tailwind config로 변환하고,
@design/components/dashboard.jsx 부터 시작해서 순서대로 Next.js 페이지로 이식해줘.
```

각 화면별 컴포넌트가 한 파일씩 분리되어 있어 단계별 이식이 쉽습니다.
