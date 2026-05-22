"use client";

import { useState, useTransition } from "react";
import { submitSelfCheckin, type KioskBookingPreview } from "@/lib/actions";

/**
 * Public guest-facing kiosk. Mounted under /k/ so the Clerk middleware
 * skips it. The token in the URL IS the auth — operators are responsible
 * for keeping it short-lived (default 7 days post-checkout).
 *
 * Two-step flow:
 *   1. Choose ETA + upload ID photo (camera or file picker).
 *   2. Confirm — server marks the booking in_house and writes a
 *      `self_check_in` BookingEvent so staff sees the guest arrived.
 */
export function KioskClient({ token, booking }: { token: string; booking: KioskBookingPreview }) {
  const [eta, setEta] = useState("16:00");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ hotelName: string; roomNumber: string | null } | null>(
    booking.alreadyCompletedAt ? { hotelName: booking.hotel.name, roomNumber: booking.roomNumber } : null,
  );

  const onPhoto = (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(String(reader.result));
    reader.onerror = () => setError("Could not read file.");
    reader.readAsDataURL(file);
  };

  const onSubmit = () => {
    if (!photoDataUrl) { setError("ID photo required."); return; }
    setError(null);
    startTransition(async () => {
      const r = await submitSelfCheckin({ token, idPhotoUrl: photoDataUrl, arrivalEta: eta });
      if ("ok" in r && r.ok) {
        setDone({ hotelName: r.hotelName, roomNumber: r.roomNumber });
      } else if ("error" in r) {
        setError(r.error);
      }
    });
  };

  return (
    <div className="kiosk">
      <header>
        {booking.hotel.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img className="logo" src={booking.hotel.logoUrl} alt={booking.hotel.name} />
        ) : (
          <div className="logo placeholder">{booking.hotel.name.slice(0, 1).toUpperCase()}</div>
        )}
        <h1>{booking.hotel.name}</h1>
        <p className="sub">Welcome, {booking.guest.name} 👋</p>
      </header>

      <section className="card">
        <h2>Your stay</h2>
        <dl className="info">
          <div><dt>Booking</dt><dd className="mono">{booking.bookingRef ?? "—"}</dd></div>
          <div><dt>Room type</dt><dd>{booking.roomType}{booking.roomNumber ? ` · ${booking.roomNumber}` : ""}</dd></div>
          <div><dt>Check-in</dt><dd>{booking.checkIn}</dd></div>
          <div><dt>Check-out</dt><dd>{booking.checkOut}</dd></div>
        </dl>
      </section>

      {done ? (
        <section className="card success">
          <div className="check">✓</div>
          <h2>You&apos;re checked in!</h2>
          <p>
            Welcome to {done.hotelName}.{" "}
            {done.roomNumber ? `Your room is ${done.roomNumber}.` : "Front desk will hand you the keys."}
          </p>
          <p className="sub">You can close this page.</p>
        </section>
      ) : (
        <section className="card">
          <h2>Check in</h2>
          <p className="sub">Two quick steps — should take less than a minute.</p>

          <div className="field">
            <label htmlFor="eta">Estimated arrival</label>
            <input
              id="eta"
              type="time"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="field">
            <label>ID photo (passport / national ID)</label>
            <p className="hint">Required by Korean hotel regulations. Stored securely; visible only to hotel staff.</p>
            {photoDataUrl ? (
              <div className="photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoDataUrl} alt="ID preview" />
                <button type="button" className="btn link" onClick={() => setPhotoDataUrl(null)} disabled={pending}>
                  Choose a different photo
                </button>
              </div>
            ) : (
              <label className="upload">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPhoto(f);
                    e.target.value = "";
                  }}
                  disabled={pending}
                />
                <span className="upload-icon">📷</span>
                <span>Tap to take photo or choose file</span>
              </label>
            )}
          </div>

          {error && <div className="alert">{error}</div>}

          <button
            className="btn primary big"
            onClick={onSubmit}
            disabled={pending || !photoDataUrl}
          >
            {pending ? "Checking in…" : "Complete check-in"}
          </button>
        </section>
      )}

      <footer>
        Powered by Stayboard ·{" "}
        <a href="mailto:support@stayboard.local">Need help?</a>
      </footer>

      <style>{`
        .kiosk {
          max-width: 520px; margin: 0 auto;
          padding: 24px 16px 60px;
          font: 16px/1.55 -apple-system, "Helvetica Neue", "Apple SD Gothic Neo", system-ui, sans-serif;
          color: #111; background: #fafafa;
          min-height: 100vh;
        }
        header { text-align: center; padding: 16px 0 24px; }
        .logo { width: 72px; height: 72px; border-radius: 16px; object-fit: cover; margin: 0 auto 12px; display: block; }
        .logo.placeholder { background: #4f46e5; color: white; display: flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; }
        h1 { font-size: 24px; font-weight: 700; margin: 8px 0 4px; letter-spacing: -0.02em; }
        .sub { color: #555; margin: 0; font-size: 14px; }
        .card { background: white; border-radius: 14px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        h2 { font-size: 17px; font-weight: 600; margin: 0 0 12px; }
        dl.info { margin: 0; display: flex; flex-direction: column; gap: 8px; }
        dl.info > div { display: grid; grid-template-columns: 110px 1fr; gap: 12px; }
        dl.info dt { color: #777; font-size: 13px; font-weight: 500; }
        dl.info dd { margin: 0; font-size: 14px; font-weight: 500; }
        .mono { font-family: "SF Mono", Menlo, Consolas, monospace; }
        .field { margin-top: 14px; }
        .field label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 6px; }
        .field .hint { font-size: 12px; color: #777; margin: 0 0 8px; }
        .field input[type="time"] { width: 140px; padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; }
        .upload { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 16px; border: 2px dashed #ccc; border-radius: 10px; cursor: pointer; transition: border-color .12s, background .12s; }
        .upload:hover { border-color: #4f46e5; background: #f5f4ff; }
        .upload input { display: none; }
        .upload-icon { font-size: 36px; }
        .photo-preview { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .photo-preview img { max-width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid #ddd; }
        .alert { background: #fee; color: #c00; padding: 10px 12px; border-radius: 8px; font-size: 14px; margin-top: 12px; }
        .btn { border: 0; padding: 12px 18px; font: inherit; font-size: 15px; font-weight: 600; border-radius: 10px; cursor: pointer; }
        .btn.primary { background: #4f46e5; color: white; }
        .btn.primary:disabled { background: #aaa; cursor: not-allowed; }
        .btn.link { background: transparent; color: #4f46e5; padding: 0; font-size: 13px; }
        .btn.big { width: 100%; padding: 16px; font-size: 16px; margin-top: 16px; }
        .success { text-align: center; padding: 32px 20px; }
        .success .check { width: 64px; height: 64px; border-radius: 999px; background: #dcfce7; color: #16a34a; font-size: 36px; font-weight: 700; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; }
        footer { text-align: center; color: #999; font-size: 12px; padding-top: 24px; }
        footer a { color: #4f46e5; text-decoration: none; }
      `}</style>
    </div>
  );
}
