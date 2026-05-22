"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { I } from "../icons";
import { channelById, type Lang } from "@/lib/i18n";
import type { RoomTypeWithRates } from "@/lib/queries";
import { paletteFor } from "@/lib/room-palette";
import { commitUpload, deleteUpload, reorderRoomPhotos, startUpload } from "@/lib/actions";
import { UploadKind } from "@prisma/client";

interface RoomsProps {
  lang?: Lang;
  roomTypes: RoomTypeWithRates[];
}

export const Rooms = ({ lang = "ko", roomTypes }: RoomsProps) => (
  <div className="page">
    <div className="rm-tabs">
      <button className="rm-tab active">{lang === "ko" ? "객실 타입" : "Room types"} <span className="num">{roomTypes.length}</span></button>
      <button className="rm-tab">{lang === "ko" ? "요금제" : "Rate plans"} <span className="num">{roomTypes.length * 2}</span></button>
      <button className="rm-tab">{lang === "ko" ? "프로모션" : "Promotions"} <span className="num">3</span></button>
      <button className="rm-tab">{lang === "ko" ? "정책" : "Policies"}</button>
      <div style={{ flex: 1 }} />
      <button className="btn primary">
        <I.plus size={13} /> {lang === "ko" ? "객실 타입 추가" : "New room type"}
      </button>
    </div>

    <section className="card">
      {roomTypes.length === 0 ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--t-3)", fontSize: 13 }}>
          {lang === "ko" ? "객실 타입이 없습니다." : "No room types yet."}
        </div>
      ) : (
        <table className="t-list rm-tbl">
          <thead>
            <tr>
              <th>{lang === "ko" ? "객실 타입" : "Room type"}</th>
              <th className="r">{lang === "ko" ? "객실 수" : "Rooms"}</th>
              <th className="r">{lang === "ko" ? "면적" : "Size"}</th>
              <th className="r">{lang === "ko" ? "최대" : "Max"}</th>
              <th className="r">{lang === "ko" ? "기준가" : "Base rate"}</th>
              <th>{lang === "ko" ? "오늘 채널 가격" : "Today's rates"}</th>
              <th>{lang === "ko" ? "연동" : "Channels"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {roomTypes.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 36, height: 28, borderRadius: 4, background: paletteFor(r.name), flex: "0 0 36px" }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{r.bedType ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="r num">{r.count}</td>
                <td className="r num">{r.sizeSqm ? `${r.sizeSqm}㎡` : "—"}</td>
                <td className="r num">{r.capacity}</td>
                <td className="r num" style={{ fontWeight: 600 }}>₩{r.baseRate.toLocaleString()}</td>
                <td>
                  <div className="ch-rate-grid">
                    {r.channelRates.length === 0 ? (
                      <span className="text-muted" style={{ fontSize: 11 }}>—</span>
                    ) : (
                      r.channelRates.map((cr) => {
                        const ch = channelById(cr.channel)!;
                        return (
                          <div key={cr.channel} className="ch-rate-mini">
                            <span className={`dot ${ch.cls}`} />
                            <span className="num">{Math.round(cr.rate / 1000)}K</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 3 }}>
                    {r.channelIds.map((c) => {
                      const ch = channelById(c)!;
                      return <span key={c} className={`dot ${ch.cls}`} style={{ width: 10, height: 10, borderRadius: 2 }} title={ch.name} />;
                    })}
                  </div>
                </td>
                <td className="r"><button className="btn sm ghost"><I.edit size={11} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>

    <section className="card" style={{ marginTop: 12 }}>
      <div className="sec-h">
        <div>
          <div className="title">{lang === "ko" ? "객실 사진" : "Room photos"}</div>
          <div className="sub">{lang === "ko" ? "객실 타입별 사진 업로드 + 순서 변경 (드래그)" : "Upload + reorder per room type (drag)"}</div>
        </div>
      </div>
      <div className="photo-grid">
        {roomTypes.map((rt) => (
          <RoomPhotoStrip key={rt.id} lang={lang} roomType={rt} />
        ))}
      </div>
    </section>

    <div className="rm-grid">
      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "취소 정책" : "Cancellation policy"}</div>
          <button className="btn sm ghost"><I.edit size={11} /> {lang === "ko" ? "편집" : "Edit"}</button>
        </div>
        <div style={{ padding: 16 }}>
          <div className="policy-row">
            <span className="pill ok">{lang === "ko" ? "7일 이상" : "7+ days"}</span>
            <span>{lang === "ko" ? "전액 환불" : "Full refund"}</span>
          </div>
          <div className="policy-row">
            <span className="pill warn">{lang === "ko" ? "3-7일" : "3-7 days"}</span>
            <span>{lang === "ko" ? "50% 환불" : "50% refund"}</span>
          </div>
          <div className="policy-row">
            <span className="pill bad">{lang === "ko" ? "3일 이내" : "< 3 days"}</span>
            <span>{lang === "ko" ? "환불 불가" : "Non-refundable"}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "체크인/아웃" : "Check-in / out"}</div>
          <button className="btn sm ghost"><I.edit size={11} /></button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="policy-row"><span className="text-muted">{lang === "ko" ? "체크인" : "Check-in"}</span><span className="num">15:00 — 23:00</span></div>
          <div className="policy-row"><span className="text-muted">{lang === "ko" ? "체크아웃" : "Check-out"}</span><span className="num">11:00</span></div>
          <div className="policy-row"><span className="text-muted">{lang === "ko" ? "얼리 체크인" : "Early check-in"}</span><span>+₩30,000</span></div>
          <div className="policy-row"><span className="text-muted">{lang === "ko" ? "레이트 체크아웃" : "Late check-out"}</span><span>+₩20,000 (14:00)</span></div>
        </div>
      </section>

      <section className="card">
        <div className="sec-h">
          <div className="title">{lang === "ko" ? "활성 프로모션" : "Active promotions"}</div>
          <button className="btn sm">{lang === "ko" ? "신규" : "New"}</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="promo">
            <div>
              <div style={{ fontWeight: 600 }}>{lang === "ko" ? "얼리버드 -15%" : "Early Bird -15%"}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>30+ {lang === "ko" ? "일 전 예약" : "days advance"}</div>
            </div>
            <span className="pill ok dot">{lang === "ko" ? "활성" : "Active"}</span>
          </div>
          <div className="promo">
            <div>
              <div style={{ fontWeight: 600 }}>{lang === "ko" ? "5박 이상 -10%" : "5+ Nights -10%"}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "직접 예약 한정" : "Direct only"}</div>
            </div>
            <span className="pill ok dot">{lang === "ko" ? "활성" : "Active"}</span>
          </div>
          <div className="promo">
            <div>
              <div style={{ fontWeight: 600 }}>{lang === "ko" ? "주중 특가" : "Midweek deal"}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>{lang === "ko" ? "월-목 -₩20K" : "Mon-Thu -₩20K"}</div>
            </div>
            <span className="pill warn dot">{lang === "ko" ? "예정" : "Scheduled"}</span>
          </div>
        </div>
      </section>
    </div>

    <style>{`
      .page { padding: 20px 24px 32px;}
      .rm-tabs { display: flex; gap: 4px; align-items: center; padding: 0 0 12px;}
      .rm-tab { border: 0; background: transparent; padding: 8px 12px; font: inherit; font-size: var(--fs-md); color: var(--t-3); cursor: pointer; border-bottom: 2px solid transparent; display: inline-flex; align-items: center; gap: 5px;}
      .rm-tab.active { color: var(--t-1); border-color: var(--acc); font-weight: 600;}
      .rm-tab .num { color: var(--t-4); font-size: 11px;}
      .ch-rate-grid { display: flex; gap: 6px; flex-wrap: wrap;}
      .ch-rate-mini { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-mute); padding: 2px 6px; border-radius: 4px; font-size: 11px;}
      .ch-rate-mini .dot { width: 6px; height: 6px; border-radius: 1px;}
      .rm-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 12px;}
      .policy-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: var(--fs-sm); color: var(--t-1);}
      .promo { display: flex; justify-content: space-between; align-items: center;}

      .photo-grid { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 14px; }

      .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md);}
      .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
      .t-list th.r, .t-list td.r { text-align: right;}
      .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
      .t-list tr:last-child td { border-bottom: 0;}
    `}</style>
  </div>
);

function RoomPhotoStrip({ lang, roomType }: { lang: Lang; roomType: RoomTypeWithRates }) {
  const router = useRouter();
  const [photos, setPhotos] = useState(roomType.photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onChoose = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      // Upload sequentially — keeps order stable + bandwidth predictable.
      // Multi-file upload is rare here so the UX cost is small.
      for (const file of Array.from(files)) {
        const presigned = await startUpload({
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          kind: UploadKind.room_photo,
        });
        if (!presigned.ok) throw new Error(presigned.error);

        let publicUrl: string;
        if (presigned.mode === "s3" && presigned.putUrl) {
          const putRes = await fetch(presigned.putUrl, {
            method: "PUT",
            headers: presigned.signedHeaders ?? {},
            body: file,
          });
          if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);
          publicUrl = presigned.publicUrl!;
        } else {
          publicUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("read failed"));
            reader.readAsDataURL(file);
          });
        }

        const commit = await commitUpload({
          kind: UploadKind.room_photo,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          url: publicUrl,
          ownerRefId: roomType.id,
        });
        if (!commit.ok) throw new Error(commit.error);
        setPhotos((prev) => [
          ...prev,
          { id: commit.uploadId, url: commit.url, filename: file.name, sortIndex: prev.length },
        ]);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (id: string) => {
    if (!confirm(lang === "ko" ? "이 사진을 삭제할까요?" : "Delete this photo?")) return;
    startTransition(async () => {
      const r = await deleteUpload(id);
      if (r.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== id));
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const onDragStart = (id: string) => setDragId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    setPhotos((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === dragId);
      const toIdx = prev.findIndex((p) => p.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const reindexed = next.map((p, i) => ({ ...p, sortIndex: i }));
      // Persist server-side after the optimistic move
      startTransition(async () => {
        const r = await reorderRoomPhotos(roomType.id, reindexed.map((p) => p.id));
        if (!r.ok) setError(r.error);
        router.refresh();
      });
      return reindexed;
    });
    setDragId(null);
  };

  return (
    <div className="rt-photo-row">
      <div className="rt-photo-head">
        <div>
          <div style={{ fontWeight: 600 }}>{roomType.name}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>
            {photos.length} {lang === "ko" ? "장" : "photos"}
          </div>
        </div>
        <label className={`btn sm ${busy ? "disabled" : ""}`}>
          <I.plus size={11} /> {busy ? (lang === "ko" ? "업로드 중…" : "Uploading…") : (lang === "ko" ? "사진 추가" : "Add photos")}
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            disabled={busy}
            onChange={(e) => {
              onChoose(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="thumbs">
        {photos.length === 0 && (
          <div className="thumb-empty">{lang === "ko" ? "사진이 없습니다" : "No photos yet"}</div>
        )}
        {photos.map((p) => (
          <div
            key={p.id}
            className={`thumb ${dragId === p.id ? "dragging" : ""}`}
            draggable
            onDragStart={() => onDragStart(p.id)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(p.id)}
            onDragEnd={() => setDragId(null)}
            title={p.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.filename} />
            <button
              type="button"
              className="thumb-del"
              onClick={() => onDelete(p.id)}
              aria-label={lang === "ko" ? "삭제" : "Delete"}
            >
              <I.close size={10} />
            </button>
          </div>
        ))}
      </div>
      {error && <div className="rt-err"><I.warn size={11} /> {error}</div>}
      <style>{`
        .rt-photo-row { border: 1px solid var(--bd-1); border-radius: 8px; padding: 10px 12px; background: var(--bg-elev); }
        .rt-photo-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .rt-photo-head .btn input { display: none; }
        .rt-photo-head .btn.disabled { opacity: 0.6; pointer-events: none; }
        .thumbs { display: flex; gap: 8px; flex-wrap: wrap; min-height: 84px; align-items: center; }
        .thumb-empty { color: var(--t-3); font-size: 12px; padding: 12px; }
        .thumb {
          position: relative; width: 110px; height: 76px;
          border: 1px solid var(--bd-1); border-radius: 6px;
          overflow: hidden; cursor: grab; background: var(--bg-mute);
          transition: transform .12s, box-shadow .12s, opacity .12s;
        }
        .thumb:active { cursor: grabbing; }
        .thumb.dragging { opacity: 0.4; transform: scale(0.96); }
        .thumb img { width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
        .thumb-del {
          position: absolute; top: 4px; right: 4px;
          width: 18px; height: 18px; padding: 0;
          border: 0; border-radius: 999px;
          background: rgba(0,0,0,0.55); color: white;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; opacity: 0; transition: opacity .12s;
        }
        .thumb:hover .thumb-del { opacity: 1; }
        .rt-err { margin-top: 8px; padding: 6px 10px; border-radius: 6px; font-size: 11px; background: var(--bad-soft); color: var(--bad); display: inline-flex; align-items: center; gap: 4px; }
      `}</style>
    </div>
  );
}
