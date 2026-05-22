import { NextResponse } from "next/server";
import { processAutomations } from "@/lib/automations";

export const runtime = "nodejs";

/**
 * Trigger endpoint for the automation tick.
 *
 * Auth: when CRON_SECRET is set, callers must include it as a Bearer token
 * (matches Vercel Cron's default header) or x-cron-secret header. When unset
 * the endpoint is open — useful for local dev, NOT for production.
 *
 * Recommended cadence: every 15-60 minutes. Idempotent (each side-effect is
 * guarded by a BookingEvent tag so re-runs don't double-fire).
 */
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    const xHeader = req.headers.get("x-cron-secret");
    const provided = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : xHeader;
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const result = await processAutomations();
  return NextResponse.json({ ok: true, ...result });
}
