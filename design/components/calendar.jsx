/* global React, I, STR, CHANNELS */
// Calendar — room×date grid with bookings, bulk edit selection, channel-differentiated rates
const { useState, useMemo, useRef, useEffect } = React;

const ROOM_TYPES = [
  { id: 'std-double', name: { ko: '스탠다드 더블', en: 'Standard Double' }, count: 12, base: 98000 },
  { id: 'std-twin',   name: { ko: '스탠다드 트윈', en: 'Standard Twin' },   count: 10, base: 102000 },
  { id: 'dlx-double', name: { ko: '디럭스 더블',   en: 'Deluxe Double' },   count: 14, base: 142000 },
  { id: 'dlx-twin',   name: { ko: '디럭스 트윈',   en: 'Deluxe Twin' },     count: 10, base: 148000 },
  { id: 'suite-king', name: { ko: '스위트 킹',     en: 'Suite King' },      count: 6,  base: 245000 },
];

// Generate fake bookings — overlapping spans across room types per day-range.
function genBookings() {
  // Format: { rt, ch, start, end, name }
  return [
    { rt: 'std-double', ch: 'airbnb',  start: 0,  end: 3,  name: 'Kim D.' },
    { rt: 'std-double', ch: 'booking', start: 4,  end: 6,  name: 'Sato' },
    { rt: 'std-double', ch: 'agoda',   start: 7,  end: 10, name: 'Chen' },
    { rt: 'std-double', ch: 'direct',  start: 11, end: 13, name: 'Park' },
    { rt: 'std-twin',   ch: 'booking', start: 1,  end: 5,  name: 'Tanaka' },
    { rt: 'std-twin',   ch: 'trip',    start: 6,  end: 9,  name: 'Lee' },
    { rt: 'std-twin',   ch: 'airbnb',  start: 10, end: 13, name: 'Wong' },
    { rt: 'dlx-double', ch: 'agoda',   start: 0,  end: 4,  name: 'Brown' },
    { rt: 'dlx-double', ch: 'airbnb',  start: 5,  end: 8,  name: 'Choi' },
    { rt: 'dlx-double', ch: 'booking', start: 9,  end: 13, name: 'Yamada' },
    { rt: 'dlx-twin',   ch: 'trip',    start: 2,  end: 6,  name: 'Liu' },
    { rt: 'dlx-twin',   ch: 'direct',  start: 7,  end: 11, name: 'Smith' },
    { rt: 'suite-king', ch: 'direct',  start: 1,  end: 4,  name: 'Anderson', vip: true },
    { rt: 'suite-king', ch: 'airbnb',  start: 6,  end: 10, name: 'Müller' },
    { rt: 'suite-king', ch: 'booking', start: 11, end: 13, name: 'García' },
    { rt: 'fb',         ch: 'fb',      start: 3,  end: 5,  name: 'FB direct' },
  ];
}

const Calendar = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const days = 14;
  const today = 2;
  const monthStart = 13; // Jan 13
  const dayLabels = lang === 'ko' ? ['일','월','화','수','목','금','토'] : ['S','M','T','W','T','F','S'];

  const [selection, setSelection] = useState(null); // {rt, start, end}
  const [hover, setHover] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Generate occupancy per day per room-type
  const occMap = useMemo(() => {
    const m = {};
    ROOM_TYPES.forEach(r => {
      m[r.id] = Array(days).fill(0).map(() => Math.floor(Math.random() * r.count * 0.6 + r.count * 0.3));
    });
    // overbooking on Jan 15 (idx 2) deluxe-double
    m['dlx-double'][2] = 15; // count is 14
    return m;
  }, []);

  // Per-channel rate for one cell (sample)
  const channelRate = (rt, dayIdx) => {
    const base = ROOM_TYPES.find(r => r.id === rt).base;
    const wknd = (dayIdx + monthStart) % 7 === 5 || (dayIdx + monthStart) % 7 === 6;
    const f = wknd ? 1.18 : 1.0;
    return {
      airbnb:  Math.round(base * f),
      booking: Math.round(base * f * 0.95),
      agoda:   Math.round(base * f * 0.97),
      trip:    Math.round(base * f * 0.96),
      direct:  Math.round(base * f * 0.92),
    };
  };

  const onCellMouseDown = (rt, day) => {
    setSelection({ rt, start: day, end: day, dragging: true });
  };
  const onCellMouseEnter = (rt, day) => {
    setHover({ rt, day });
    setSelection(s => s && s.dragging && s.rt === rt ? { ...s, end: day } : s);
  };
  const onCellMouseUp = () => {
    setSelection(s => {
      if (!s) return null;
      const fixed = { ...s, dragging: false, start: Math.min(s.start, s.end), end: Math.max(s.start, s.end) };
      setBulkOpen(true);
      return fixed;
    });
  };

  useEffect(() => {
    const up = () => onCellMouseUp();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const isSelected = (rt, day) => {
    if (!selection || selection.rt !== rt) return false;
    const lo = Math.min(selection.start, selection.end), hi = Math.max(selection.start, selection.end);
    return day >= lo && day <= hi;
  };

  const bookings = useMemo(genBookings, []);

  const ch = (id) => CHANNELS.find(c => c.id === id);

  const headerDays = Array(days).fill(0).map((_, i) => {
    const dom = monthStart + i;
    const dow = (dom + 5) % 7; // arbitrary alignment
    return { dom, dow, label: dayLabels[dow], weekend: dow === 0 || dow === 6, today: i === today };
  });

  return (
    <div className="cal-page">
      {/* Sub-toolbar */}
      <div className="cal-tools">
        <div className="left">
          <button className="btn ghost icon"><I.chevL size={14}/></button>
          <button className="btn ghost">{lang === 'ko' ? '2026년 1월' : 'January 2026'} <I.chevD size={12}/></button>
          <button className="btn ghost icon"><I.chevR size={14}/></button>
          <div className="seg">
            <button className="seg-btn">7d</button>
            <button className="seg-btn active">14d</button>
            <button className="seg-btn">30d</button>
            <button className="seg-btn">90d</button>
          </div>
          <button className="btn sm ghost"><I.cal size={12}/> {t.today}</button>
        </div>
        <div className="right">
          <div className="legend">
            <span><i className="lg-d lg-booked"/>{lang === 'ko' ? '예약' : 'Booked'}</span>
            <span><i className="lg-d lg-blocked"/>{lang === 'ko' ? '차단' : 'Blocked'}</span>
            <span><i className="lg-d lg-held"/>{lang === 'ko' ? '홀드' : 'Hold'}</span>
            <span><i className="lg-d lg-over"/>{lang === 'ko' ? '오버부킹' : 'Overbook'}</span>
          </div>
          <button className="btn sm ghost"><I.eye size={12}/> {lang === 'ko' ? '뷰' : 'View'}</button>
          <button className="btn sm ghost"><I.filter size={12}/> {lang === 'ko' ? '필터' : 'Filter'}</button>
          <button className="btn sm primary"><I.edit size={12}/> {t.bulk}</button>
        </div>
      </div>

      {/* Grid */}
      <div className="cal-wrap">
        <div className="cal-grid" onMouseLeave={() => setHover(null)}>
          {/* Top-left corner */}
          <div className="cal-corner">
            <span className="tracker">{lang === 'ko' ? '객실 타입' : 'Room Type'}</span>
          </div>

          {/* Day headers */}
          <div className="cal-head-row">
            {headerDays.map((d, i) => (
              <div key={i} className={`cal-head ${d.weekend ? 'wknd' : ''} ${d.today ? 'today' : ''}`}>
                <div className="dow">{d.label}</div>
                <div className="dom num">{d.dom}</div>
              </div>
            ))}
          </div>

          {/* Rows */}
          {ROOM_TYPES.map(rt => {
            const occ = occMap[rt.id];
            return (
              <React.Fragment key={rt.id}>
                {/* Room label */}
                <div className="cal-rt">
                  <button className="rt-toggle"><I.chevD size={11}/></button>
                  <div className="rt-meta">
                    <div className="rt-name">{rt.name[lang]}</div>
                    <div className="rt-sub text-muted">{rt.count} {t.rooms}</div>
                  </div>
                </div>

                {/* Inventory row */}
                <div className="cal-row inv">
                  {headerDays.map((d, i) => {
                    const o = occ[i];
                    const left = rt.count - o;
                    const over = o > rt.count;
                    return (
                      <div
                        key={i}
                        className={`cal-cell inv ${d.weekend ? 'wknd' : ''} ${d.today ? 'today' : ''} ${over ? 'over' : ''} ${isSelected(rt.id, i) ? 'sel' : ''}`}
                        onMouseDown={() => onCellMouseDown(rt.id, i)}
                        onMouseEnter={() => onCellMouseEnter(rt.id, i)}
                      >
                        <div className="cell-bar">
                          <div className="bar-bg">
                            <div className="bar-fill" style={{width: `${Math.min(o/rt.count, 1) * 100}%`}}/>
                          </div>
                        </div>
                        <div className="cell-num num">{over ? <span className="over-txt">+{o - rt.count}</span> : left}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Channel rate rows */}
                {['airbnb','booking','agoda','trip','direct'].map(chId => (
                  <React.Fragment key={chId}>
                    <div className="cal-rt sub-row">
                      <span className="sub-spacer"/>
                      <span className="mini-ch">
                        <span className={`dot ${ch(chId).cls}`}/>{ch(chId).name}
                      </span>
                    </div>
                    <div className="cal-row rate">
                      {headerDays.map((d, i) => {
                        const rates = channelRate(rt.id, i);
                        const v = rates[chId];
                        return (
                          <div
                            key={i}
                            className={`cal-cell rate-cell ${d.weekend ? 'wknd' : ''} ${d.today ? 'today' : ''} ${isSelected(rt.id, i) ? 'sel' : ''}`}
                            onMouseDown={() => onCellMouseDown(rt.id, i)}
                            onMouseEnter={() => onCellMouseEnter(rt.id, i)}
                          >
                            <div className="rate-val num">{Math.round(v / 1000)}K</div>
                          </div>
                        );
                      })}
                    </div>
                  </React.Fragment>
                ))}

                {/* Booking spans overlay row */}
                <div className="cal-rt sub-row">
                  <span className="sub-spacer"/>
                  <span className="text-muted" style={{fontSize: 11, paddingLeft: 18}}>{lang === 'ko' ? '예약' : 'Bookings'}</span>
                </div>
                <div className="cal-row span-row">
                  {headerDays.map((d, i) => (
                    <div key={i} className={`cal-cell bg ${d.weekend ? 'wknd' : ''} ${d.today ? 'today' : ''}`}/>
                  ))}
                  <div className="span-overlay">
                    {bookings.filter(b => b.rt === rt.id).map((b, i) => {
                      const w = (b.end - b.start + 1);
                      return (
                        <div
                          key={i}
                          className={`booking-span ch-${b.ch}`}
                          style={{
                            left: `calc(${b.start} * (100% / ${days}) + 2px)`,
                            width: `calc(${w} * (100% / ${days}) - 4px)`,
                          }}
                        >
                          <span className={`dot ${ch(b.ch).cls}`}/>
                          <span className="nm">{b.name}</span>
                          {b.vip && <I.star size={10}/>}
                        </div>
                      );
                    })}
                    {/* Overbooking flag on Jan 15 deluxe-double */}
                    {rt.id === 'dlx-double' && (
                      <div className="overbook-flag" style={{left: `calc(${2} * (100% / ${days}) + 2px)`, width: `calc(1 * (100% / ${days}) - 4px)`}}>
                        <I.warn size={10}/> {lang === 'ko' ? '오버부킹' : 'Overbook'}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Bulk edit popover */}
      {bulkOpen && selection && !selection.dragging && (
        <div className="bulk-pop">
          <div className="bulk-head">
            <div>
              <div className="title" style={{fontSize: 14, fontWeight: 600}}>{t.bulk}</div>
              <div className="text-muted" style={{fontSize: 12}}>
                {ROOM_TYPES.find(r => r.id === selection.rt).name[lang]} · {Math.abs(selection.end - selection.start) + 1}{lang === 'ko' ? '일' : 'd'} ({headerDays[Math.min(selection.start, selection.end)].dom}–{headerDays[Math.max(selection.start, selection.end)].dom} {lang === 'ko' ? '1월' : 'Jan'})
              </div>
            </div>
            <button className="btn ghost icon" onClick={() => { setBulkOpen(false); setSelection(null); }}><I.close size={14}/></button>
          </div>

          <div className="bulk-body">
            <div className="bulk-row">
              <label>{lang === 'ko' ? '가격' : 'Rate'}</label>
              <div className="bulk-input">
                <span className="prefix">₩</span>
                <input className="input" defaultValue="158,400" style={{flex: 1, border: 0, paddingLeft: 0}}/>
                <button className="btn sm ghost"><I.sparkle size={11}/> AI</button>
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === 'ko' ? '재고' : 'Inventory'}</label>
              <div className="bulk-input">
                <input type="number" className="input" defaultValue="14" style={{flex: 1}}/>
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === 'ko' ? '최소 숙박' : 'Min stay'}</label>
              <div className="bulk-input">
                <input type="number" className="input" defaultValue="2" style={{flex: 1}}/>
                <span className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '박' : 'nights'}</span>
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === 'ko' ? '적용 채널' : 'Channels'}</label>
              <div className="ch-checks">
                {['airbnb','booking','agoda','trip','direct'].map(c => (
                  <label key={c} className="ch-check">
                    <input type="checkbox" defaultChecked/>
                    <span className={`dot ${ch(c).cls}`}/>
                    <span>{ch(c).name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="bulk-row">
              <label>{lang === 'ko' ? '요일 한정' : 'Days of week'}</label>
              <div className="dow-chips">
                {dayLabels.map((d, i) => (
                  <button key={i} className={`dow-chip ${i === 5 || i === 6 ? 'on' : ''}`}>{d}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="bulk-foot">
            <span className="text-muted" style={{fontSize: 11}}>
              {lang === 'ko' ? '예상 영향: 14개 셀 업데이트' : 'Will update 14 cells'}
            </span>
            <div style={{display: 'flex', gap: 6}}>
              <button className="btn ghost sm" onClick={() => { setBulkOpen(false); setSelection(null); }}>{t.cancel}</button>
              <button className="btn primary sm">{t.apply}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .cal-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .cal-tools {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 24px; gap: 12px;
          border-bottom: 1px solid var(--bd-1);
          background: var(--bg);
        }
        .cal-tools .left, .cal-tools .right { display: flex; align-items: center; gap: 6px; }
        .seg { display: inline-flex; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px; margin-left: 4px; }
        .seg-btn { border: 0; background: transparent; padding: 2px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500; }
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1); }
        .legend { display: flex; gap: 12px; margin-right: 8px; font-size: var(--fs-xs); color: var(--t-3); align-items: center;}
        .legend span { display: inline-flex; align-items: center; gap: 5px;}
        .lg-d { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
        .lg-booked { background: var(--cal-booked); border: 1px solid #93c5fd; }
        .lg-blocked { background: var(--cal-blocked); border: 1px solid #fca5a5;}
        .lg-held    { background: var(--cal-held); border: 1px solid #fcd34d;}
        .lg-over    { background: #fee2e2; border: 1px solid var(--bad);}

        .cal-wrap { flex: 1; min-height: 0; overflow: auto; background: var(--bg); }
        .cal-grid {
          display: grid;
          grid-template-columns: 200px 1fr;
          min-width: max-content;
        }
        .cal-corner {
          position: sticky; top: 0; left: 0; z-index: 5;
          background: var(--bg); border-right: 1px solid var(--bd-2); border-bottom: 1px solid var(--bd-2);
          padding: 12px 14px;
          display: flex; align-items: center;
        }
        .cal-head-row {
          position: sticky; top: 0; z-index: 4;
          background: var(--bg); border-bottom: 1px solid var(--bd-2);
          display: grid;
          grid-template-columns: repeat(${days}, minmax(72px, 1fr));
        }
        .cal-head {
          padding: 8px 0;
          text-align: center;
          border-left: 1px solid var(--bd-1);
          font-size: var(--fs-sm); color: var(--t-3);
        }
        .cal-head.wknd { background: var(--cal-weekend); }
        .cal-head.today { background: var(--acc-soft); color: var(--acc-text); }
        .cal-head .dow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .cal-head .dom { font-size: 16px; font-weight: 600; color: var(--t-1); margin-top: 2px;}
        .cal-head.today .dom { color: var(--acc-text); }

        .cal-rt {
          position: sticky; left: 0; z-index: 2;
          background: var(--bg); border-right: 1px solid var(--bd-2); border-bottom: 1px solid var(--bd-1);
          padding: 8px 14px 8px 6px;
          display: flex; align-items: center; gap: 6px;
        }
        .cal-rt.sub-row { padding: 4px 14px 4px 28px; background: var(--bg-1); }
        .rt-toggle { border: 0; background: transparent; cursor: pointer; color: var(--t-3); padding: 2px; display: flex; }
        .rt-meta { flex: 1; min-width: 0; }
        .rt-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); }
        .rt-sub { font-size: 11px; }
        .sub-spacer { width: 14px; }

        .cal-row {
          display: grid;
          grid-template-columns: repeat(${days}, minmax(72px, 1fr));
          border-bottom: 1px solid var(--bd-1);
        }
        .cal-row.rate { background: var(--bg-1); }

        .cal-cell {
          border-left: 1px solid var(--bd-1);
          padding: 4px 6px;
          position: relative;
          cursor: pointer;
          user-select: none;
        }
        .cal-cell.wknd { background: var(--cal-weekend); }
        .cal-row.rate .cal-cell.wknd { background: #f5f5fa; }
        .theme-dark .cal-row.rate .cal-cell.wknd { background: #161620;}
        .cal-cell.today { box-shadow: inset 2px 0 0 var(--acc); }
        .cal-cell.sel  { background: var(--acc-soft); box-shadow: inset 0 0 0 1px var(--acc);}
        .cal-cell:hover { background: var(--bg-hover);}

        .cal-cell.inv { padding: 6px 8px; }
        .cal-cell.inv .cell-num {
          font-size: 13px; font-weight: 600; color: var(--t-1);
          text-align: right;
          margin-top: 4px;
        }
        .cal-cell.inv .cell-bar { width: 100%; }
        .bar-bg { height: 4px; background: var(--bg-mute); border-radius: 2px; overflow: hidden; }
        .bar-fill { height: 100%; background: var(--acc); border-radius: 2px; }
        .cal-cell.over { background: #fee2e2; }
        .cal-cell.over .bar-fill { background: var(--bad);}
        .over-txt { color: var(--bad); }

        .rate-cell { padding: 4px 8px; }
        .rate-val { font-size: 12px; color: var(--t-2); text-align: right; font-weight: 500;}

        .cal-row.span-row { position: relative; height: 32px;}
        .cal-cell.bg { padding: 0; cursor: default;}
        .cal-cell.bg:hover { background: transparent; }
        .span-overlay {
          position: absolute; left: 0; right: 0; top: 4px; bottom: 4px;
          pointer-events: none;
        }
        .booking-span {
          position: absolute; top: 0; bottom: 0;
          display: flex; align-items: center; gap: 5px;
          padding: 0 8px;
          border-radius: 4px;
          background: var(--cal-booked);
          font-size: 11px; font-weight: 500; color: var(--t-1);
          overflow: hidden; white-space: nowrap;
          pointer-events: auto; cursor: pointer;
          box-shadow: var(--shadow-1);
        }
        .booking-span .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px; }
        .booking-span.ch-airbnb  { background: #ffe4ea;}
        .booking-span.ch-booking { background: #dbeafe;}
        .booking-span.ch-agoda   { background: #ffe4d4;}
        .booking-span.ch-trip    { background: #dbeafe;}
        .booking-span.ch-direct  { background: #ede9fe;}
        .booking-span.ch-fb      { background: #dbeafe;}
        .theme-dark .booking-span { background: var(--cal-booked); color: var(--t-1);}

        .overbook-flag {
          position: absolute; top: 0; bottom: 0;
          display: flex; align-items: center; justify-content: center; gap: 4px;
          background: var(--bad); color: white;
          font-size: 10px; font-weight: 600;
          border-radius: 4px;
          pointer-events: auto;
          z-index: 2;
          animation: pulse 1.6s infinite;
        }
        @keyframes pulse { 0%,100% { opacity: 1;} 50% { opacity: .7;} }

        /* Bulk popover */
        .bulk-pop {
          position: fixed; right: 24px; bottom: 24px; width: 360px;
          background: var(--bg-elev);
          border: 1px solid var(--bd-2);
          border-radius: var(--r-lg);
          box-shadow: var(--shadow-pop);
          z-index: 50;
          overflow: hidden;
        }
        .bulk-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px 12px; border-bottom: 1px solid var(--bd-1);}
        .bulk-body { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px;}
        .bulk-row label { display: block; font-size: var(--fs-xs); color: var(--t-3); margin-bottom: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em;}
        .bulk-input { display: flex; align-items: center; gap: 6px; border: 1px solid var(--bd-2); border-radius: var(--r-sm); padding: 0 8px; height: 32px; background: var(--bg);}
        .bulk-input .prefix { color: var(--t-3); font-size: 13px;}
        .bulk-input .input { border: 0; height: 30px; padding: 0;}
        .bulk-input .input:focus { box-shadow: none;}
        .ch-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 4px;}
        .ch-check { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); cursor: pointer; padding: 4px;}
        .ch-check .dot { width: 8px; height: 8px; border-radius: 2px;}
        .dow-chips { display: flex; gap: 4px;}
        .dow-chip { width: 30px; height: 28px; border: 1px solid var(--bd-2); background: var(--bg); border-radius: 4px; cursor: pointer; font: inherit; font-size: 12px; color: var(--t-2);}
        .dow-chip.on { background: var(--acc); color: white; border-color: var(--acc);}
        .bulk-foot { padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--bd-1); background: var(--bg-1);}
      `}</style>
    </div>
  );
};
window.Calendar = Calendar;
