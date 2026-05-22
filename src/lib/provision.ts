import "server-only";
import { ChannelStatus, ChannelType, type Hotel } from "@prisma/client";
import { prisma } from "./db";

export interface ProvisionInput {
  name: string;
  timezone?: string;
  currency?: string;
}

/**
 * Creates a fresh tenant with the bare minimum so the app is usable
 * immediately after sign-up:
 *
 * - 1 Hotel
 * - 1 placeholder RoomType ("Standard Room") with 1 Room ("101")
 * - 1 Standard rate plan
 * - 6 Channel rows (all in `synced` state, but no real OTA credentials)
 * - 4 default Korean SavedReplies
 *
 * Returns the new Hotel. Idempotent on the hotel name when called within the
 * same transaction is intentionally NOT guaranteed — the caller (e.g. Clerk
 * webhook) should pass a guaranteed-unique name.
 */
export async function provisionNewHotel(input: ProvisionInput): Promise<Hotel> {
  return await prisma.$transaction(async (tx) => {
    const hotel = await tx.hotel.create({
      data: {
        name: input.name,
        timezone: input.timezone ?? "Asia/Seoul",
        currency: input.currency ?? "KRW",
      },
    });

    const roomType = await tx.roomType.create({
      data: {
        hotelId: hotel.id,
        name: "Standard Room",
        capacity: 2,
        baseRate: 100_000,
        bedType: "Queen",
        sizeSqm: 24,
        amenities: ["wifi", "tv", "ac"],
        rooms: { create: [{ number: "101" }] },
        ratePlans: {
          create: [{ name: "Standard", refundable: true, modifier: 1.0 }],
        },
      },
    });

    const channelTypes: ChannelType[] = [
      ChannelType.airbnb,
      ChannelType.booking,
      ChannelType.agoda,
      ChannelType.trip,
      ChannelType.direct,
      ChannelType.fb,
    ];
    await tx.channel.createMany({
      data: channelTypes.map((type) => ({ hotelId: hotel.id, type, status: ChannelStatus.synced })),
    });

    await tx.savedReply.createMany({
      data: [
        { hotelId: hotel.id, label: "체크인 안내", body: "안녕하세요! 체크인이 완료되었습니다. 편안한 시간 보내세요." },
        { hotelId: hotel.id, label: "주차 안내", body: "지하 1층 주차장을 이용하실 수 있습니다." },
        { hotelId: hotel.id, label: "레이트 체크아웃", body: "14:00까지 레이트 체크아웃 가능합니다." },
        { hotelId: hotel.id, label: "와이파이", body: "Wi-Fi: Welcome / Password: welcome2026" },
        { hotelId: hotel.id, label: "리뷰 요청", body: "이용해주셔서 감사합니다! 짧은 리뷰 부탁드립니다 🙏" },
      ],
    });

    // Touch roomType to silence unused-var (it's the seam for callers that
    // want to immediately seed inventory/rates after provisioning).
    void roomType;

    return hotel;
  });
}
