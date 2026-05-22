-- Row-Level Security tenant isolation (defense-in-depth).
--
-- Model: a per-transaction GUC `app.current_hotel_id` names the active tenant.
--   * When UNSET (or empty) — e.g. webhooks, cron, provisioning, seed, admin
--     cross-tenant views, and the tenant-resolution query itself — policies are
--     PERMISSIVE (all rows visible). These trusted server paths are unchanged.
--   * When SET (session-scoped queries via withTenant()) — policies RESTRICT
--     every table to that hotel, catching any query that forgot to filter by
--     hotelId. This is a safety net beneath the app's existing where-clauses,
--     not a replacement for them.
--
-- The app connects as the table OWNER (stayboard), which bypasses RLS by
-- default, so every table is also FORCE'd.
--
-- Tables WITHOUT a tenant column (SlowQueryLog, AutomationLog, WebhookLog) are
-- intentionally left un-secured — they are cross-tenant operator logs.

-- Returns the active tenant id, or NULL when no tenant context is set.
CREATE OR REPLACE FUNCTION app_current_hotel() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.current_hotel_id', true), '') $$;

-- ── Tenant root ────────────────────────────────────────────────────────────
ALTER TABLE "Hotel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Hotel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Hotel" FOR ALL
  USING (app_current_hotel() IS NULL OR "id" = app_current_hotel())
  WITH CHECK (app_current_hotel() IS NULL OR "id" = app_current_hotel());

-- ── Directly hotel-scoped tables (have a "hotelId" column) ──────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'PushSubscription','RoomType','Channel','Guest','Booking','Thread',
    'SavedReply','Middleware','InventoryLock','SavedFilter',
    'OutboundIntegration','UploadedFile','EmailTemplate'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I FOR ALL
        USING (app_current_hotel() IS NULL OR "hotelId" = app_current_hotel())
        WITH CHECK (app_current_hotel() IS NULL OR "hotelId" = app_current_hotel());
    $f$, t);
  END LOOP;
END $$;

-- ── Transitively scoped tables (reach hotelId via a parent FK) ──────────────

-- via RoomType.hotelId
ALTER TABLE "Room" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Room" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Room" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Room"."roomTypeId" AND rt."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Room"."roomTypeId" AND rt."hotelId" = app_current_hotel()));

ALTER TABLE "RatePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RatePlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RatePlan" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "RatePlan"."roomTypeId" AND rt."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "RatePlan"."roomTypeId" AND rt."hotelId" = app_current_hotel()));

ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Inventory" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Inventory"."roomTypeId" AND rt."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Inventory"."roomTypeId" AND rt."hotelId" = app_current_hotel()));

ALTER TABLE "Rate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Rate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Rate" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Rate"."roomTypeId" AND rt."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "RoomType" rt WHERE rt."id" = "Rate"."roomTypeId" AND rt."hotelId" = app_current_hotel()));

-- via Channel.hotelId
ALTER TABLE "ChannelMap" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelMap" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ChannelMap" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Channel" c WHERE c."id" = "ChannelMap"."channelId" AND c."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Channel" c WHERE c."id" = "ChannelMap"."channelId" AND c."hotelId" = app_current_hotel()));

ALTER TABLE "SyncLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SyncLog" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Channel" c WHERE c."id" = "SyncLog"."channelId" AND c."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Channel" c WHERE c."id" = "SyncLog"."channelId" AND c."hotelId" = app_current_hotel()));

-- via Thread.hotelId
ALTER TABLE "Message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Message" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Message" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Thread" th WHERE th."id" = "Message"."threadId" AND th."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Thread" th WHERE th."id" = "Message"."threadId" AND th."hotelId" = app_current_hotel()));

-- via Booking.hotelId
ALTER TABLE "BookingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingRequest" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "BookingRequest"."bookingId" AND b."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "BookingRequest"."bookingId" AND b."hotelId" = app_current_hotel()));

ALTER TABLE "BookingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookingEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BookingEvent" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "BookingEvent"."bookingId" AND b."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "BookingEvent"."bookingId" AND b."hotelId" = app_current_hotel()));

ALTER TABLE "CheckinToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CheckinToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CheckinToken" FOR ALL
  USING (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "CheckinToken"."bookingId" AND b."hotelId" = app_current_hotel()))
  WITH CHECK (app_current_hotel() IS NULL OR EXISTS (
    SELECT 1 FROM "Booking" b WHERE b."id" = "CheckinToken"."bookingId" AND b."hotelId" = app_current_hotel()));
