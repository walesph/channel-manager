/* global React, I, STR, CHANNELS */
const { useState: useState_c } = React;

// Channels page — connection cards + sync log + mappings
const Channels = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const ch = (id) => CHANNELS.find(c => c.id === id);

  const data = [
    { id: 'airbnb',  status: 'connected', listings: 5, bk: 142, rev: 18420, fee: 15, lastSync: '14:02', issues: 0 },
    { id: 'booking', status: 'connected', listings: 5, bk: 124, rev: 16108, fee: 17, lastSync: '14:02', issues: 1 },
    { id: 'agoda',   status: 'syncing',   listings: 5, bk: 62,  rev: 8050,  fee: 18, lastSync: '14:01', issues: 0 },
    { id: 'trip',    status: 'connected', listings: 5, bk: 49,  rev: 6325,  fee: 15, lastSync: '14:02', issues: 0 },
    { id: 'direct',  status: 'connected', listings: 5, bk: 38,  rev: 6900,  fee: 0,  lastSync: '14:02', issues: 0 },
    { id: 'fb',      status: 'delayed',   listings: 5, bk: 12,  rev: 1725,  fee: 0,  lastSync: '13:54', issues: 1 },
  ];

  const [add, setAdd] = useState_c(false);

  return (
    <div className="page">
      <div className="ch-grid">
        {data.map(d => {
          const c = ch(d.id);
          return (
            <div key={d.id} className="ch-card">
              <div className="ch-card-h">
                <div className="ch-icon" style={{background: c.color}}>
                  <span>{c.short}</span>
                </div>
                <div className="ch-card-meta">
                  <div className="nm">{c.name}</div>
                  <div className="st">
                    {d.status === 'connected' && <span className="pill ok dot">{lang === 'ko' ? '연결됨' : 'Connected'}</span>}
                    {d.status === 'syncing'   && <span className="pill info dot">{lang === 'ko' ? '동기화 중' : 'Syncing'}</span>}
                    {d.status === 'delayed'   && <span className="pill warn dot">{lang === 'ko' ? '지연' : 'Delayed'}</span>}
                    {d.issues > 0 && <span className="pill bad" style={{height: 18}}><I.warn size={10}/> {d.issues}</span>}
                  </div>
                </div>
                <button className="btn ghost icon"><I.more size={14}/></button>
              </div>
              <div className="ch-card-body">
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === 'ko' ? '리스팅' : 'Listings'}</div>
                  <div className="val num">{d.listings}/5</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === 'ko' ? '예약 (월)' : 'Bookings'}</div>
                  <div className="val num">{d.bk}</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === 'ko' ? '수익 (월)' : 'Revenue'}</div>
                  <div className="val num">₩{(d.rev/1000).toFixed(1)}K</div>
                </div>
                <div className="ch-stat">
                  <div className="lbl tracker">{lang === 'ko' ? '수수료' : 'Commission'}</div>
                  <div className="val num">{d.fee}%</div>
                </div>
              </div>
              <div className="ch-card-foot">
                <span className="text-muted" style={{fontSize: 11}}>
                  <I.refresh size={11} style={{verticalAlign: -2}}/> {lang === 'ko' ? '마지막' : 'Last sync'} {d.lastSync}
                </span>
                <button className="btn sm ghost"><I.setting size={11}/> {lang === 'ko' ? '설정' : 'Configure'}</button>
              </div>
            </div>
          );
        })}

        <button className="ch-add" onClick={() => setAdd(true)}>
          <I.plus size={20}/>
          <span>{lang === 'ko' ? '채널 추가' : 'Add channel'}</span>
          <span className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? 'Expedia, 야놀자, 여기어때 외 12개' : 'Expedia, Hotels.com & 12 more'}</span>
        </button>
      </div>

      {/* Sync log */}
      <section className="card" style={{marginTop: 12}}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === 'ko' ? '동기화 로그' : 'Sync log'}</div>
            <div className="sub">{lang === 'ko' ? '최근 24시간' : 'Last 24h'}</div>
          </div>
          <div style={{display: 'flex', gap: 6}}>
            <button className="btn sm ghost"><I.filter size={12}/> {lang === 'ko' ? '필터' : 'Filter'}</button>
            <button className="btn sm ghost"><I.download size={12}/> {lang === 'ko' ? '내보내기' : 'Export'}</button>
          </div>
        </div>
        <table className="t-list">
          <thead>
            <tr>
              <th style={{width: 80}}>{lang === 'ko' ? '시각' : 'Time'}</th>
              <th>{lang === 'ko' ? '채널' : 'Channel'}</th>
              <th>{lang === 'ko' ? '작업' : 'Operation'}</th>
              <th className="r">{lang === 'ko' ? '대상' : 'Target'}</th>
              <th>{lang === 'ko' ? '결과' : 'Result'}</th>
              <th className="r">{lang === 'ko' ? '시간' : 'Duration'}</th>
            </tr>
          </thead>
          <tbody>
            {[
              { t: '14:02:08', ch: 'airbnb',  op: lang === 'ko' ? '재고 푸시' : 'Push inventory', target: '14 days × 5 rooms', ok: true,  ms: 312 },
              { t: '14:02:04', ch: 'booking', op: lang === 'ko' ? '가격 푸시' : 'Push rates',      target: '14 days × 5 rooms', ok: true,  ms: 504 },
              { t: '14:01:58', ch: 'agoda',   op: lang === 'ko' ? '예약 가져오기' : 'Pull bookings',target: '3 new bookings',     ok: 'sync',ms: null },
              { t: '14:00:00', ch: 'trip',    op: lang === 'ko' ? '재고 푸시' : 'Push inventory',  target: '14 days × 5 rooms', ok: true,  ms: 218 },
              { t: '13:54:30', ch: 'fb',      op: lang === 'ko' ? '예약 가져오기' : 'Pull bookings',target: '6 bookings',        ok: 'warn',ms: 8420, note: lang === 'ko' ? 'API 응답 지연' : 'API timeout' },
              { t: '13:48:12', ch: 'booking', op: lang === 'ko' ? '가격 충돌' : 'Rate mismatch',   target: 'Deluxe Double 1/15', ok: 'bad',  ms: null, note: lang === 'ko' ? '수동 해결됨' : 'Resolved manually' },
              { t: '13:30:00', ch: 'airbnb',  op: lang === 'ko' ? '예약 가져오기' : 'Pull bookings',target: '2 new bookings',    ok: true,  ms: 480 },
              { t: '13:00:00', ch: 'direct',  op: lang === 'ko' ? '재고 푸시' : 'Push inventory',  target: '14 days × 5 rooms', ok: true,  ms: 102 },
            ].map((r, i) => (
              <tr key={i}>
                <td className="mono text-muted">{r.t}</td>
                <td><span className="mini-ch"><span className={`dot ${ch(r.ch).cls}`}/>{ch(r.ch).name}</span></td>
                <td>{r.op}</td>
                <td className="r text-muted">{r.target}</td>
                <td>
                  {r.ok === true  && <span className="pill ok dot">{lang === 'ko' ? '성공' : 'Success'}</span>}
                  {r.ok === 'sync'&& <span className="pill info dot">{lang === 'ko' ? '진행중' : 'In progress'}</span>}
                  {r.ok === 'warn'&& <span className="pill warn dot">{r.note}</span>}
                  {r.ok === 'bad' && <span className="pill bad dot">{r.note}</span>}
                </td>
                <td className="r mono text-muted">{r.ms ? `${r.ms}ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Add channel modal */}
      {add && (
        <div className="modal-bg" onClick={() => setAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-head">
              <div>
                <div style={{fontSize: 16, fontWeight: 600}}>{lang === 'ko' ? '채널 추가' : 'Add channel'}</div>
                <div className="text-muted" style={{fontSize: 12}}>{lang === 'ko' ? 'OTA 또는 직접 채널 연결' : 'Connect an OTA or direct channel'}</div>
              </div>
              <button className="btn ghost icon" onClick={() => setAdd(false)}><I.close size={14}/></button>
            </div>
            <div className="md-body">
              <div className="add-grid">
                {[
                  { id: 'expedia',  name: 'Expedia',     col: '#fdb913' },
                  { id: 'hotelscom',name: 'Hotels.com',  col: '#d32f2f' },
                  { id: 'yanolja',  name: '야놀자',       col: '#ec5a3c' },
                  { id: 'ygkk',     name: '여기어때',     col: '#0066ff' },
                  { id: 'naver',    name: '네이버 예약',  col: '#03c75a' },
                  { id: 'google',   name: 'Google',      col: '#4285f4' },
                  { id: 'instagram',name: 'Instagram',   col: '#e1306c' },
                  { id: 'kakao',    name: 'Kakao',       col: '#fee500' },
                ].map(c => (
                  <button key={c.id} className="add-tile">
                    <div className="add-ic" style={{background: c.col}}>{c.name.charAt(0)}</div>
                    <div className="add-nm">{c.name}</div>
                    <div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '연결' : 'Connect'} →</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .ch-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 16px; display: flex; flex-direction: column; gap: 12px;}
        .ch-card-h { display: flex; align-items: center; gap: 10px;}
        .ch-icon { width: 36px; height: 36px; border-radius: 8px; color: white; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex: 0 0 36px; letter-spacing: 0.5px;}
        .ch-card-meta { flex: 1; min-width: 0;}
        .ch-card-meta .nm { font-size: var(--fs-md); font-weight: 600; color: var(--t-1);}
        .ch-card-meta .st { display: flex; gap: 4px; margin-top: 2px;}
        .ch-card-body { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; padding: 8px 0; border-top: 1px solid var(--bd-1); border-bottom: 1px solid var(--bd-1);}
        .ch-stat .lbl { font-size: 10px; color: var(--t-3); margin-bottom: 2px;}
        .ch-stat .val { font-size: 16px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .ch-card-foot { display: flex; justify-content: space-between; align-items: center;}

        .ch-add { background: transparent; border: 1.5px dashed var(--bd-2); border-radius: var(--r-md); padding: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; cursor: pointer; color: var(--t-3); font: inherit; min-height: 200px;}
        .ch-add:hover { border-color: var(--acc); color: var(--acc); background: var(--acc-soft);}
        .ch-add span:first-of-type { font-size: var(--fs-md); font-weight: 600;}

        .modal-bg { position: fixed; inset: 0; background: rgba(15,15,20,0.5); display: flex; align-items: center; justify-content: center; z-index: 100;}
        .modal { width: 600px; background: var(--bg-elev); border: 1px solid var(--bd-2); border-radius: var(--r-lg); box-shadow: var(--shadow-pop); overflow: hidden;}
        .md-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--bd-1);}
        .md-body { padding: 16px 20px;}
        .add-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;}
        .add-tile { background: transparent; border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px; cursor: pointer; font: inherit; display: flex; flex-direction: column; align-items: flex-start; gap: 6px;}
        .add-tile:hover { border-color: var(--acc); background: var(--acc-soft);}
        .add-ic { width: 28px; height: 28px; border-radius: 6px; color: white; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center;}
        .add-nm { font-weight: 600; color: var(--t-1); font-size: var(--fs-md);}
      `}</style>
    </div>
  );
};
window.Channels = Channels;
