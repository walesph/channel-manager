import "server-only";
import { prisma } from "./db";

/**
 * Lightweight learned-rate model.
 *
 * We fit a linear regression per room type on historical booking samples.
 * Features (intercept first):
 *   [1, dow_sin, dow_cos, month_sin, month_cos, isWeekend, leadTimeDays, occRatio]
 *
 * Target: per-night rate (booking.total / nights) for stays that started in
 * the past `sinceDays` window. We use closed-form normal equations
 * (X^T X)^{-1} X^T y — trivial at this feature dimension (8) and avoids
 * adding a numeric library dep.
 *
 * When fewer than `MIN_SAMPLES` historical samples exist we mark the model
 * `confidence: "low"` and the caller falls back to the heuristic. This avoids
 * overfit on freshly-onboarded hotels.
 */

const MIN_SAMPLES = 30;
const FEATURE_COUNT = 8;

export interface RoomTypeRateModel {
  roomTypeId: string;
  weights: number[]; // length = FEATURE_COUNT
  /** Number of training samples. */
  n: number;
  /** "low" → caller should fall back; "ok" → model is usable; "good" → high confidence. */
  confidence: "low" | "ok" | "good";
  /** Average prediction error (KRW) on training set — surfaced in UI for trust. */
  trainMae: number;
}

export interface RatePredictionInput {
  roomTypeId: string;
  iso: string; // YYYY-MM-DD
  occRatio: number; // 0..1
  leadTimeDays: number;
}

interface Sample {
  features: number[]; // length = FEATURE_COUNT (intercept first)
  target: number;
}

function featureVector(iso: string, occRatio: number, leadTimeDays: number): number[] {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0..6
  const month = d.getUTCMonth(); // 0..11
  const isWeekend = dow === 5 || dow === 6 ? 1 : 0;
  // Cyclic encoding so Saturday is "near" Friday and Sunday — avoids edge-bias.
  const dowSin = Math.sin((2 * Math.PI * dow) / 7);
  const dowCos = Math.cos((2 * Math.PI * dow) / 7);
  const monSin = Math.sin((2 * Math.PI * month) / 12);
  const monCos = Math.cos((2 * Math.PI * month) / 12);
  return [1, dowSin, dowCos, monSin, monCos, isWeekend, leadTimeDays, occRatio];
}

/** Solve (X^T X + λI) w = X^T y via Gauss-Jordan. λ adds gentle ridge regularization. */
function solveNormalEqs(samples: Sample[], lambda = 1e-3): number[] | null {
  const n = samples.length;
  if (n === 0) return null;
  const k = FEATURE_COUNT;
  // XtX: k×k symmetric
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty: number[] = new Array(k).fill(0);
  for (const s of samples) {
    for (let i = 0; i < k; i++) {
      xty[i] += s.features[i] * s.target;
      for (let j = 0; j < k; j++) {
        xtx[i][j] += s.features[i] * s.features[j];
      }
    }
  }
  // Ridge: + λI
  for (let i = 0; i < k; i++) xtx[i][i] += lambda;

  // Augment [XtX | XtY] and run Gauss-Jordan
  const aug: number[][] = xtx.map((row, i) => [...row, xty[i]]);
  for (let col = 0; col < k; col++) {
    // Partial pivot — find max |aug[r][col]| in r >= col
    let pivot = col;
    for (let r = col + 1; r < k; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (Math.abs(aug[pivot][col]) < 1e-9) return null; // singular
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    // Normalize pivot row
    const div = aug[col][col];
    for (let j = col; j <= k; j++) aug[col][j] /= div;
    // Eliminate other rows
    for (let r = 0; r < k; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= k; j++) {
        aug[r][j] -= factor * aug[col][j];
      }
    }
  }
  return aug.map((row) => row[k]);
}

function predictRaw(weights: number[], features: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += weights[i] * features[i];
  return sum;
}

/**
 * Build per-room-type rate models from the past `sinceDays` of confirmed
 * bookings. One model per room type. Returns a Map keyed by roomTypeId.
 */
export async function learnHotelRateModel(hotelId: string, sinceDays = 90): Promise<Map<string, RoomTypeRateModel>> {
  const now = Date.now();
  const since = new Date(now - sinceDays * 86_400_000);

  const [bookings, totalRoomsByType] = await Promise.all([
    prisma.booking.findMany({
      where: {
        hotelId,
        status: { in: ["confirmed", "in_house", "checked_out"] },
        checkIn: { gte: since },
      },
      select: { roomTypeId: true, checkIn: true, checkOut: true, total: true, createdAt: true },
    }),
    prisma.room.groupBy({
      by: ["roomTypeId"],
      where: { roomType: { hotelId } },
      _count: { _all: true },
    }),
  ]);

  const capacityByRt = new Map<string, number>();
  for (const r of totalRoomsByType) {
    capacityByRt.set(r.roomTypeId, Math.max(1, r._count._all));
  }

  // Build per-night samples per roomType. occRatio is computed as same-day
  // overlapping booking density / capacity.
  const samplesByRt = new Map<string, Sample[]>();
  // Pre-index bookings by roomTypeId for the occupancy lookup
  const bookingsByRt = new Map<string, { checkIn: Date; checkOut: Date }[]>();
  for (const b of bookings) {
    const arr = bookingsByRt.get(b.roomTypeId) ?? [];
    arr.push({ checkIn: b.checkIn, checkOut: b.checkOut });
    bookingsByRt.set(b.roomTypeId, arr);
  }

  for (const b of bookings) {
    const nights = Math.max(1, Math.round((b.checkOut.getTime() - b.checkIn.getTime()) / 86_400_000));
    const rate = Math.round(b.total / nights);
    if (rate <= 0) continue;
    const cap = capacityByRt.get(b.roomTypeId) ?? 1;
    const sameType = bookingsByRt.get(b.roomTypeId) ?? [];

    // Sample one night from the booking — the first night, to keep
    // sample count bounded. Multi-night sampling biases long stays.
    const dayMs = b.checkIn.getTime();
    const dayEnd = dayMs + 86_400_000;
    let occupied = 0;
    for (const o of sameType) {
      if (o.checkIn.getTime() < dayEnd && o.checkOut.getTime() > dayMs) occupied++;
    }
    const occRatio = Math.min(1, occupied / cap);
    const leadTime = Math.max(0, Math.round((dayMs - b.createdAt.getTime()) / 86_400_000));
    const iso = b.checkIn.toISOString().slice(0, 10);
    const features = featureVector(iso, occRatio, leadTime);

    const arr = samplesByRt.get(b.roomTypeId) ?? [];
    arr.push({ features, target: rate });
    samplesByRt.set(b.roomTypeId, arr);
  }

  const result = new Map<string, RoomTypeRateModel>();
  for (const [rtId, samples] of samplesByRt.entries()) {
    if (samples.length < 5) {
      // Truly degenerate — emit a low-confidence flat model so callers can
      // detect "no signal here".
      result.set(rtId, {
        roomTypeId: rtId,
        weights: new Array(FEATURE_COUNT).fill(0),
        n: samples.length,
        confidence: "low",
        trainMae: 0,
      });
      continue;
    }
    const weights = solveNormalEqs(samples);
    if (!weights) {
      result.set(rtId, {
        roomTypeId: rtId,
        weights: new Array(FEATURE_COUNT).fill(0),
        n: samples.length,
        confidence: "low",
        trainMae: 0,
      });
      continue;
    }
    let sumAbs = 0;
    for (const s of samples) {
      const pred = predictRaw(weights, s.features);
      sumAbs += Math.abs(pred - s.target);
    }
    const mae = sumAbs / samples.length;
    const confidence: RoomTypeRateModel["confidence"] =
      samples.length >= 80 ? "good" : samples.length >= MIN_SAMPLES ? "ok" : "low";
    result.set(rtId, { roomTypeId: rtId, weights, n: samples.length, confidence, trainMae: Math.round(mae) });
  }
  return result;
}

/**
 * Predict the recommended rate for a future (rt, day, occupancy) tuple.
 * Returns null when the model is low-confidence — caller should fall back.
 */
export function predictRate(model: RoomTypeRateModel, input: RatePredictionInput): number | null {
  if (model.confidence === "low") return null;
  const features = featureVector(input.iso, input.occRatio, input.leadTimeDays);
  const raw = predictRaw(model.weights, features);
  // Clamp to a sensible range (avoids predicting negative rates on sparse data).
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // Round to nearest 1000 KRW (matches the heuristic's grain so UX is uniform).
  return Math.round(raw / 1000) * 1000;
}

export interface FeatureContribution {
  /** Display label (i18n is the caller's job — the model speaks ascii). */
  label: string;
  /** Raw weight × feature value contribution to the prediction (KRW). */
  contribution: number;
  /** Feature value (for tooltip context). */
  featureValue: number;
}

/**
 * Per-feature contribution breakdown for a single prediction.
 *
 * Linear regression makes this trivial: each feature contributes
 * `w_i × x_i` independently. The intercept is bundled as "기본가 (intercept)"
 * so the bar-chart sums to the predicted rate.
 *
 * Returns null when the model is low-confidence (no meaningful breakdown).
 */
export function explainPrediction(model: RoomTypeRateModel, input: RatePredictionInput): FeatureContribution[] | null {
  if (model.confidence === "low") return null;
  const features = featureVector(input.iso, input.occRatio, input.leadTimeDays);
  const labels = [
    "intercept",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    "isWeekend",
    "leadTimeDays",
    "occupancy",
  ];
  return labels.map((label, i) => ({
    label,
    contribution: Math.round(model.weights[i] * features[i]),
    featureValue: features[i],
  }));
}
