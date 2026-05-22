"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useApp } from "@/lib/app-context";
import { I } from "@/components/icons";
import { importCsv } from "@/lib/actions";

type Kind = "guests" | "bookings";
type Step = "upload" | "map" | "preview" | "done";

const FIELDS_BY_KIND: Record<Kind, { name: string; required: boolean; hint: string }[]> = {
  guests: [
    { name: "name", required: true, hint: "이름 / Name" },
    { name: "email", required: false, hint: "이메일 / Email (dedupe key)" },
    { name: "phone", required: false, hint: "전화 / Phone" },
    { name: "country", required: false, hint: "국가 코드 / Country (KR/US/JP/...)" },
    { name: "language", required: false, hint: "언어 / Language (ko/en/ja/zh)" },
  ],
  bookings: [
    { name: "guestName", required: true, hint: "게스트 이름" },
    { name: "guestEmail", required: false, hint: "게스트 이메일 (게스트 매칭)" },
    { name: "guestCountry", required: false, hint: "게스트 국가 코드" },
    { name: "channel", required: true, hint: "채널 (airbnb/booking/agoda/...)" },
    { name: "roomTypeName", required: true, hint: "객실 타입 이름 (정확히)" },
    { name: "checkIn", required: true, hint: "체크인 YYYY-MM-DD" },
    { name: "checkOut", required: true, hint: "체크아웃 YYYY-MM-DD" },
    { name: "total", required: true, hint: "총액 (KRW 정수)" },
    { name: "externalRef", required: false, hint: "예약번호 (dedupe key)" },
    { name: "status", required: false, hint: "상태 (default: confirmed)" },
    { name: "payment", required: false, hint: "결제 (default: paid)" },
  ],
};

/**
 * Tries to auto-map CSV headers → known fields via case-insensitive contains
 * matching. Reduces clicks for the common case where headers already follow
 * the same vocabulary (name/email/phone, etc).
 */
function autoMap(headers: string[], fields: { name: string }[]): Record<string, string> {
  const m: Record<string, string> = {};
  const lowered = headers.map((h) => h.toLowerCase().replace(/[\s_-]/g, ""));
  for (const f of fields) {
    const target = f.name.toLowerCase();
    const found = lowered.findIndex((h) => h === target || h.includes(target) || target.includes(h));
    if (found >= 0) m[f.name] = headers[found];
  }
  return m;
}

function parsePreview(csv: string): { headers: string[]; rows: string[][] } {
  // Lightweight client-side parser — used only for the preview/map step.
  // Server re-parses with the strict CSV reader before importing.
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.length > 0).slice(0, 6);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

export function ImportWizardClient() {
  const { lang } = useApp();
  const [kind, setKind] = useState<Kind>("bookings");
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [dryResult, setDryResult] = useState<Awaited<ReturnType<typeof importCsv>> | null>(null);
  const [committed, setCommitted] = useState<Awaited<ReturnType<typeof importCsv>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (csvText ? parsePreview(csvText) : { headers: [], rows: [] }), [csvText]);
  const fields = FIELDS_BY_KIND[kind];

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError(lang === "ko" ? "파일이 너무 큽니다 (최대 5MB)" : "File too large (max 5MB)");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    setFilename(file.name);
    const parsed = parsePreview(text);
    setMapping(autoMap(parsed.headers, fields));
    setStep("map");
  };

  const onDryRun = () => {
    setError(null);
    startTransition(async () => {
      const r = await importCsv({ kind, csv: csvText, mapping, dryRun: true });
      if ("ok" in r && r.ok) {
        setDryResult(r);
        setStep("preview");
      } else {
        setError("error" in r ? r.error : "unknown error");
      }
    });
  };

  const onCommit = () => {
    if (!confirm(lang === "ko" ? "정말 가져오시겠습니까? 되돌릴 수 없습니다." : "Really import? This can't be undone.")) return;
    setError(null);
    startTransition(async () => {
      const r = await importCsv({ kind, csv: csvText, mapping, dryRun: false });
      if ("ok" in r && r.ok) {
        setCommitted(r);
        setStep("done");
      } else {
        setError("error" in r ? r.error : "unknown error");
      }
    });
  };

  const reset = () => {
    setStep("upload");
    setCsvText("");
    setFilename("");
    setMapping({});
    setDryResult(null);
    setCommitted(null);
    setError(null);
  };

  const requiredMissing = fields.filter((f) => f.required && !mapping[f.name]).map((f) => f.name);

  return (
    <div className="page">
      <div className="header">
        <Link href="/settings" className="back-link text-muted">
          <I.arrowL size={11} /> {lang === "ko" ? "설정" : "Settings"}
        </Link>
        <h1>{lang === "ko" ? "CSV 가져오기" : "CSV import"}</h1>
        <div className="sub text-muted">
          {lang === "ko"
            ? "기존 PMS의 게스트 / 예약 데이터를 CSV로 일괄 등록합니다."
            : "Bulk-import guests / bookings from another PMS via CSV."}
        </div>
      </div>

      <div className="steps">
        {(["upload", "map", "preview", "done"] as const).map((s, i) => (
          <div key={s} className={`step ${step === s ? "active" : ""} ${["upload", "map", "preview", "done"].indexOf(step) > i ? "done" : ""}`}>
            <span className="num">{i + 1}</span>
            <span className="lbl">
              {s === "upload" && (lang === "ko" ? "파일 업로드" : "Upload")}
              {s === "map" && (lang === "ko" ? "컬럼 매핑" : "Map columns")}
              {s === "preview" && (lang === "ko" ? "검증 + 미리보기" : "Validate")}
              {s === "done" && (lang === "ko" ? "완료" : "Done")}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="alert bad"><I.warn size={12} /> {error}</div>
      )}

      {step === "upload" && (
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "1. CSV 선택" : "1. Choose CSV"}</div>
          </div>
          <div className="upload-body">
            <div className="kind-toggle">
              <button className={`kind-btn ${kind === "bookings" ? "active" : ""}`} onClick={() => setKind("bookings")}>
                {lang === "ko" ? "예약" : "Bookings"}
              </button>
              <button className={`kind-btn ${kind === "guests" ? "active" : ""}`} onClick={() => setKind("guests")}>
                {lang === "ko" ? "게스트" : "Guests"}
              </button>
            </div>
            <label className="drop">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <I.download size={20} style={{ transform: "rotate(180deg)" }} />
              <div>
                <div style={{ fontWeight: 600 }}>{lang === "ko" ? "CSV 파일 선택" : "Choose CSV file"}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {lang === "ko" ? "최대 5MB · UTF-8 (BOM ok)" : "Up to 5MB · UTF-8 (BOM ok)"}
                </div>
              </div>
            </label>
            <div className="hint text-muted" style={{ fontSize: 12 }}>
              {lang === "ko"
                ? "필수 컬럼: " + fields.filter((f) => f.required).map((f) => f.name).join(", ")
                : "Required columns: " + fields.filter((f) => f.required).map((f) => f.name).join(", ")}
            </div>
          </div>
        </section>
      )}

      {(step === "map" || step === "preview") && (
        <section className="card">
          <div className="sec-h">
            <div>
              <div className="title">
                {lang === "ko" ? "2. 컬럼 매핑" : "2. Map columns"}
                <span className="text-muted" style={{ fontSize: 11, marginLeft: 8, fontWeight: 400 }}>
                  {filename}
                </span>
              </div>
              <div className="sub">
                {lang === "ko"
                  ? `${preview.rows.length}개 미리보기 행 · ${preview.headers.length}개 컬럼`
                  : `${preview.rows.length} preview rows · ${preview.headers.length} columns`}
              </div>
            </div>
            <button className="btn sm ghost" onClick={reset}>
              {lang === "ko" ? "다른 파일" : "Different file"}
            </button>
          </div>
          <div className="map-body">
            {fields.map((f) => (
              <div key={f.name} className="map-row">
                <label>
                  <span className="fname">{f.name}</span>
                  {f.required && <span className="req">*</span>}
                  <span className="fhint text-muted">{f.hint}</span>
                </label>
                <select
                  value={mapping[f.name] ?? ""}
                  onChange={(e) => setMapping({ ...mapping, [f.name]: e.target.value })}
                >
                  <option value="">{lang === "ko" ? "(매핑 안함)" : "(unmapped)"}</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {step === "map" && (
            <div className="map-foot">
              {requiredMissing.length > 0 && (
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {lang === "ko" ? "필수 미매핑: " : "Missing required: "}
                  {requiredMissing.join(", ")}
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn sm" onClick={onDryRun} disabled={requiredMissing.length > 0 || pending}>
                {pending ? "…" : (lang === "ko" ? "검증" : "Validate")}
              </button>
            </div>
          )}
        </section>
      )}

      {step === "preview" && dryResult && "ok" in dryResult && dryResult.ok && (
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === "ko" ? "3. 검증 결과" : "3. Validation result"}</div>
          </div>
          <div className="result">
            <div className="result-stats">
              <Stat label={lang === "ko" ? "신규 생성" : "Will create"} value={dryResult.toCreate} cls="ok" />
              <Stat label={lang === "ko" ? "업데이트" : "Will update"} value={dryResult.toUpdate} cls="info" />
              <Stat label={lang === "ko" ? "건너뜀" : "Will skip"} value={dryResult.toSkip} cls="muted" />
              <Stat label={lang === "ko" ? "오류" : "Errors"} value={dryResult.errors.length} cls={dryResult.errors.length > 0 ? "bad" : "muted"} />
            </div>
            {dryResult.errors.length > 0 && (
              <div className="errors">
                <div className="sub">{lang === "ko" ? "오류 (처음 10건)" : "Errors (first 10)"}</div>
                <ul>
                  {dryResult.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>
                      <span className="row-idx mono">row {e.rowIdx}</span> · {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="map-foot">
            <button className="btn sm ghost" onClick={() => setStep("map")} disabled={pending}>
              {lang === "ko" ? "← 매핑 수정" : "← Edit mapping"}
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn sm primary" onClick={onCommit} disabled={dryResult.toCreate + dryResult.toUpdate === 0 || pending}>
              {pending
                ? "…"
                : lang === "ko"
                ? `${dryResult.toCreate + dryResult.toUpdate}건 가져오기`
                : `Import ${dryResult.toCreate + dryResult.toUpdate}`}
            </button>
          </div>
        </section>
      )}

      {step === "done" && committed && "ok" in committed && committed.ok && (
        <section className="card success">
          <div className="success-body">
            <I.check size={32} />
            <div className="title">
              {lang === "ko"
                ? `완료 — ${committed.toCreate}건 생성, ${committed.toUpdate}건 업데이트`
                : `Done — ${committed.toCreate} created, ${committed.toUpdate} updated`}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {committed.errors.length > 0 && (lang === "ko" ? `${committed.errors.length}건 오류 (건너뜀)` : `${committed.errors.length} errors (skipped)`)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn sm" onClick={reset}>{lang === "ko" ? "다시 가져오기" : "Import again"}</button>
              <Link className="btn sm primary" href={kind === "bookings" ? "/bookings" : "/settings"}>
                {lang === "ko" ? "결과 보기 →" : "View results →"}
              </Link>
            </div>
          </div>
        </section>
      )}

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .header h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 4px 0 2px; color: var(--t-1); }
        .back-link { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; text-decoration: none; }
        .header .sub { font-size: 12px; }
        .alert { padding: 8px 12px; border-radius: 6px; font-size: 12px; display: flex; align-items: center; gap: 6px; background: var(--bad-soft); color: var(--bad); }
        .steps { display: flex; gap: 8px; align-items: center; }
        .step { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; background: var(--bg-elev); border: 1px solid var(--bd-1); font-size: 12px; color: var(--t-3); }
        .step.active { background: var(--acc); border-color: var(--acc); color: white; }
        .step.done { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
        .step .num { font-weight: 700; opacity: 0.7; }
        .step.active .num { opacity: 1; }
        .step .lbl { font-weight: 500; }
        .upload-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; align-items: center; }
        .kind-toggle { display: inline-flex; gap: 0; border: 1px solid var(--bd-1); border-radius: 6px; overflow: hidden; }
        .kind-btn { border: 0; padding: 6px 14px; font: inherit; font-size: 12px; background: var(--bg-elev); color: var(--t-2); cursor: pointer; }
        .kind-btn.active { background: var(--acc); color: white; font-weight: 600; }
        .drop {
          width: 100%; max-width: 480px; padding: 24px;
          border: 2px dashed var(--bd-2); border-radius: 8px;
          display: flex; flex-direction: column; align-items: center; gap: 8px;
          cursor: pointer; transition: border-color .12s, background .12s;
          color: var(--t-2);
        }
        .drop:hover { border-color: var(--acc); background: var(--acc-soft); }
        .drop input { display: none; }
        .drop > div { text-align: center; }
        .hint { text-align: center; }
        .map-body { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; }
        .map-row { display: grid; grid-template-columns: 1fr 200px; gap: 12px; align-items: center; }
        .map-row label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
        .map-row .fname { font-family: monospace; font-weight: 600; color: var(--t-1); }
        .map-row .req { color: var(--bad); font-weight: 700; }
        .map-row .fhint { font-size: 11px; }
        .map-row select {
          height: 30px; padding: 0 8px; border: 1px solid var(--bd-1); border-radius: 6px;
          background: var(--bg-elev); color: var(--t-1); font: inherit; font-size: 12px;
        }
        .map-foot { display: flex; align-items: center; padding: 8px 16px 16px; gap: 8px; }
        .result { padding: 14px 16px; }
        .result-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .stat-tile { padding: 12px; border-radius: 6px; border: 1px solid var(--bd-1); }
        .stat-tile.ok    { background: var(--ok-soft); border-color: var(--ok); color: var(--ok); }
        .stat-tile.info  { background: var(--acc-soft); border-color: var(--acc); color: var(--acc); }
        .stat-tile.bad   { background: var(--bad-soft); border-color: var(--bad); color: var(--bad); }
        .stat-tile.muted { background: var(--bg-elev); }
        .stat-tile .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; font-weight: 600; }
        .stat-tile .val { font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
        .errors { margin-top: 14px; }
        .errors .sub { font-size: 11px; color: var(--t-3); margin-bottom: 6px; }
        .errors ul { margin: 0; padding: 0; list-style: none; max-height: 220px; overflow: auto; border: 1px solid var(--bd-1); border-radius: 6px; }
        .errors li { padding: 6px 10px; border-bottom: 1px solid var(--bd-1); font-size: 11px; color: var(--t-2); }
        .errors li:last-child { border-bottom: 0; }
        .row-idx { color: var(--bad); margin-right: 4px; }
        .success-body { padding: 32px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--ok); }
        .success-body .title { font-weight: 600; color: var(--t-1); font-size: 16px; }
      `}</style>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`stat-tile ${cls}`}>
      <div className="lbl">{label}</div>
      <div className="val">{value.toLocaleString()}</div>
    </div>
  );
}
