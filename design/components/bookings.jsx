/* global React, I, STR, CHANNELS */
const { useState: useState_b } = React;

const Bookings = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const [sel, setSel] = useState_b(0);

  const ch = (id) => CHANNELS.find(c => c.id === id);

  const list = [
    { id: 'BK-2942', ch: 'airbnb',  name: '김도윤', en: 'Kim Doyun',     status: 'confirmed', room: '1208', rt: 'dlx-twin',   ci: '1/13', co: '1/16', n: 3, total: 474000, paid: true,  flag: '🇰🇷', new: false, vip: true },
    { id: 'BK-2941', ch: 'booking', name: '佐藤美咲',en: 'Sato Misaki',  status: 'confirmed', room: '0805', rt: 'dlx-double', ci: '1/13', co: '1/18', n: 5, total: 790000, paid: true,  flag: '🇯🇵', new: true },
    { id: 'BK-2940', ch: 'agoda',   name: 'M. Chen',  en: 'Michael Chen', status: 'pending',   room: '1405', rt: 'std-twin',   ci: '1/13', co: '1/15', n: 2, total: 204000, paid: false, flag: '🇨🇳', new: true },
    { id: 'BK-2939', ch: 'direct',  name: 'J. Smith', en: 'James Smith',  status: 'confirmed', room: '0902', rt: 'suite-king', ci: '1/13', co: '1/17', n: 4, total: 980000, paid: true,  flag: '🇺🇸' },
    { id: 'BK-2938', ch: 'trip',    name: '박서연',   en: 'Park Seoyeon', status: 'confirmed', room: '1102', rt: 'std-double', ci: '1/13', co: '1/14', n: 1, total: 102000, paid: true,  flag: '🇰🇷' },
    { id: 'BK-2937', ch: 'fb',      name: 'Anna L.',  en: 'Anna Larsson', status: 'pending',   room: '—',    rt: 'dlx-double', ci: '1/14', co: '1/19', n: 5, total: 740000, paid: false, flag: '🇸🇪', new: true },
    { id: 'BK-2936', ch: 'airbnb',  name: 'Müller',   en: 'Hans Müller',  status: 'confirmed', room: '0606', rt: 'std-double', ci: '1/14', co: '1/16', n: 2, total: 196000, paid: true,  flag: '🇩🇪' },
    { id: 'BK-2935', ch: 'booking', name: '田中健',   en: 'Tanaka Ken',   status: 'cancelled', room: '—',    rt: 'std-twin',   ci: '1/14', co: '1/17', n: 3, total: 306000, paid: false, flag: '🇯🇵' },
    { id: 'BK-2934', ch: 'agoda',   name: 'Wei C.',   en: 'Wei Chen',     status: 'confirmed', room: '1308', rt: 'dlx-twin',   ci: '1/15', co: '1/17', n: 2, total: 296000, paid: true,  flag: '🇨🇳' },
    { id: 'BK-2933', ch: 'direct',  name: '이지현',   en: 'Lee Jihyun',   status: 'confirmed', room: '0501', rt: 'std-double', ci: '1/15', co: '1/18', n: 3, total: 294000, paid: true,  flag: '🇰🇷' },
  ];

  const cur = list[sel];
  const rtName = { 'std-double': lang==='ko'?'스탠다드 더블':'Standard Double', 'std-twin': lang==='ko'?'스탠다드 트윈':'Standard Twin', 'dlx-double': lang==='ko'?'디럭스 더블':'Deluxe Double', 'dlx-twin': lang==='ko'?'디럭스 트윈':'Deluxe Twin', 'suite-king': lang==='ko'?'스위트 킹':'Suite King' };

  const statusPill = (s) => {
    if (s === 'confirmed') return <span className="pill ok dot">{lang === 'ko' ? '확정' : 'Confirmed'}</span>;
    if (s === 'pending')   return <span className="pill warn dot">{lang === 'ko' ? '대기' : 'Pending'}</span>;
    if (s === 'cancelled') return <span className="pill bad dot">{lang === 'ko' ? '취소' : 'Cancelled'}</span>;
  };

  return (
    <div className="bk-wrap">
      {/* Filters bar */}
      <div className="bk-filters">
        <div className="seg">
          <button className="seg-btn active">{lang === 'ko' ? '모두' : 'All'} <span className="num">142</span></button>
          <button className="seg-btn">{lang === 'ko' ? '신규' : 'New'} <span className="badge">3</span></button>
          <button className="seg-btn">{lang === 'ko' ? '체크인' : 'Arriving'} <span className="num">12</span></button>
          <button className="seg-btn">{lang === 'ko' ? '체크아웃' : 'Departing'} <span className="num">8</span></button>
          <button className="seg-btn">{lang === 'ko' ? '취소' : 'Cancelled'} <span className="num">2</span></button>
        </div>
        <div style={{flex: 1}}/>
        <div className="search-bar">
          <I.search size={13}/>
          <input placeholder={lang === 'ko' ? '예약 ID, 이름, 객실…' : 'Booking ID, name, room…'}/>
        </div>
        <button className="btn sm ghost"><I.filter size={12}/> {lang === 'ko' ? '필터' : 'Filter'}</button>
        <button className="btn sm ghost"><I.download size={12}/> {lang === 'ko' ? '내보내기' : 'Export'}</button>
      </div>

      <div className="bk-split">
        {/* Left list */}
        <div className="bk-list">
          {list.map((b, i) => (
            <button key={b.id} className={`bk-row ${sel === i ? 'active' : ''}`} onClick={() => setSel(i)}>
              {b.new && <div className="new-dot"/>}
              <div className="bk-row-top">
                <div className="bk-name">
                  <span className="flag">{b.flag}</span>
                  {lang === 'ko' ? b.name : b.en}
                  {b.vip && <span className="pill warn" style={{height: 14, fontSize: 9, padding: '0 4px'}}>VIP</span>}
                </div>
                <div className="bk-total num">₩{(b.total / 1000).toLocaleString()}K</div>
              </div>
              <div className="bk-row-mid">
                <span className="mini-ch"><span className={`dot ${ch(b.ch).cls}`}/>{ch(b.ch).name}</span>
                <span className="text-muted">·</span>
                <span className="text-muted">{rtName[b.rt]}</span>
              </div>
              <div className="bk-row-bot">
                <span className="num">{b.ci} → {b.co}</span>
                <span className="text-muted">· {b.n}{lang === 'ko' ? '박' : 'n'}</span>
                {statusPill(b.status)}
              </div>
            </button>
          ))}
        </div>

        {/* Right detail */}
        <div className="bk-detail">
          <div className="bd-head">
            <div className="bd-id">
              <span className="bd-num mono">#{cur.id}</span>
              {statusPill(cur.status)}
              <span className="mini-ch"><span className={`dot ${ch(cur.ch).cls}`}/>{ch(cur.ch).name}</span>
              <span className="text-muted" style={{fontSize: 12}}>· {lang === 'ko' ? '수신' : 'Received'} 1/12 09:42</span>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <button className="btn sm ghost"><I.msg size={12}/> {lang === 'ko' ? '메시지' : 'Message'}</button>
              <button className="btn sm ghost"><I.external size={12}/> {ch(cur.ch).name}</button>
              <button className="btn sm ghost icon"><I.more size={12}/></button>
            </div>
          </div>

          <div className="bd-hero">
            <div className="bd-guest">
              <div className="bd-avatar">{(lang === 'ko' ? cur.name : cur.en).charAt(0)}</div>
              <div>
                <div className="bd-gname">{lang === 'ko' ? cur.name : cur.en} <span className="flag">{cur.flag}</span></div>
                <div className="text-muted" style={{fontSize: 12}}>kim.doyun@gmail.com · +82 10-2384-7521</div>
                <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                  {cur.vip && <span className="pill warn">VIP</span>}
                  <span className="pill"><I.star size={10}/> 4.92</span>
                  <span className="pill">{lang === 'ko' ? '재방문 3회' : '3rd stay'}</span>
                </div>
              </div>
            </div>
            <div className="bd-stay">
              <div className="stay-dates">
                <div>
                  <div className="lbl tracker">{lang === 'ko' ? '체크인' : 'Check-in'}</div>
                  <div className="day num">1월 13일</div>
                  <div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '월요일 15:00' : 'Mon · 15:00'}</div>
                </div>
                <div className="arrow"><I.arrowR size={14}/></div>
                <div>
                  <div className="lbl tracker">{lang === 'ko' ? '체크아웃' : 'Check-out'}</div>
                  <div className="day num">1월 16일</div>
                  <div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '목요일 11:00' : 'Thu · 11:00'}</div>
                </div>
                <div style={{flex: 1}}/>
                <div>
                  <div className="lbl tracker">{lang === 'ko' ? '박' : 'Nights'}</div>
                  <div className="day num">{cur.n}</div>
                </div>
                <div>
                  <div className="lbl tracker">{lang === 'ko' ? '게스트' : 'Guests'}</div>
                  <div className="day num">2 <span style={{fontSize: 12, color: 'var(--t-3)'}}>· 2A</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bd-grid">
            <div className="bd-card">
              <div className="card-h">{lang === 'ko' ? '객실 & 요금' : 'Room & rate'}</div>
              <div className="bd-rate">
                <div className="rt-line">
                  <div>
                    <div className="rt-name">{rtName[cur.rt]}</div>
                    <div className="text-muted" style={{fontSize: 12}}>{lang === 'ko' ? '객실' : 'Room'} {cur.room} · {lang === 'ko' ? '조식 포함' : 'Breakfast included'}</div>
                  </div>
                  <div className="rt-prc num">₩{Math.round(cur.total / cur.n).toLocaleString()}/박</div>
                </div>
                <div className="hr"/>
                <div className="bd-bill">
                  <div><span>{lang === 'ko' ? '소계' : 'Subtotal'}</span><span className="num">₩{Math.round(cur.total * 0.91).toLocaleString()}</span></div>
                  <div><span>{lang === 'ko' ? '부가세' : 'Tax'}</span><span className="num">₩{Math.round(cur.total * 0.09).toLocaleString()}</span></div>
                  <div><span>{lang === 'ko' ? '채널 수수료' : 'Channel fee'} (15%)</span><span className="num text-muted">−₩{Math.round(cur.total * 0.15).toLocaleString()}</span></div>
                  <div className="hr"/>
                  <div className="total"><span>{lang === 'ko' ? '게스트 결제' : 'Guest pays'}</span><span className="num">₩{cur.total.toLocaleString()}</span></div>
                  <div className="total" style={{color: 'var(--ok)'}}><span>{lang === 'ko' ? '실수령' : 'Net to you'}</span><span className="num">₩{Math.round(cur.total * 0.85).toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === 'ko' ? '결제' : 'Payment'}</div>
              <div className="pay-block">
                <div className="pay-status ok">
                  <I.check size={14}/> {lang === 'ko' ? '결제 완료' : 'Paid in full'}
                </div>
                <div className="pay-meta text-muted" style={{fontSize: 12}}>
                  <I.cc size={12}/> Visa **** 4827 · {lang === 'ko' ? 'Airbnb 결제' : 'Charged via Airbnb'}
                </div>
                <div className="pay-meta text-muted" style={{fontSize: 12}}>
                  <I.calCheck size={12}/> {lang === 'ko' ? '예약 시 결제 · 1/12 09:42' : 'Charged at booking · Jan 12 09:42'}
                </div>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === 'ko' ? '특별 요청' : 'Special requests'}</div>
              <div className="req-list">
                <div className="req"><I.bed size={12}/> {lang === 'ko' ? '높은 층 객실 요청' : 'High floor requested'}</div>
                <div className="req"><I.user size={12}/> {lang === 'ko' ? '얼리 체크인 (가능 시)' : 'Early check-in if possible'}</div>
                <div className="req"><I.info size={12}/> {lang === 'ko' ? '비건 조식' : 'Vegan breakfast'}</div>
              </div>
            </div>

            <div className="bd-card">
              <div className="card-h">{lang === 'ko' ? '활동' : 'Activity'}</div>
              <div className="act-list">
                <div className="act"><div className="act-d"/><div><b>{lang === 'ko' ? '예약 생성' : 'Booking created'}</b><div className="text-muted" style={{fontSize: 11}}>1/12 09:42 · Airbnb</div></div></div>
                <div className="act"><div className="act-d"/><div><b>{lang === 'ko' ? '결제 완료' : 'Payment captured'}</b><div className="text-muted" style={{fontSize: 11}}>1/12 09:42 · ₩474,000</div></div></div>
                <div className="act"><div className="act-d"/><div><b>{lang === 'ko' ? '확인 메일 발송' : 'Confirmation sent'}</b><div className="text-muted" style={{fontSize: 11}}>1/12 09:43 · auto</div></div></div>
                <div className="act"><div className="act-d hl"/><div><b>{lang === 'ko' ? '게스트 메시지' : 'Guest message'}</b><div className="text-muted" style={{fontSize: 11}}>1/12 14:21 · "{lang === 'ko' ? '얼리 체크인 가능할까요?' : 'Is early check-in possible?'}"</div></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .bk-wrap { display: flex; flex-direction: column; height: 100%;}
        .bk-filters {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 24px;
          border-bottom: 1px solid var(--bd-1);
          background: var(--bg);
        }
        .bk-filters .seg-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; height: 24px;}
        .bk-filters .badge { background: var(--bad); color: white; padding: 0 5px; min-width: 16px; height: 14px; line-height: 14px; border-radius: 999px; font-size: 9px; font-weight: 600;}
        .search-bar { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 28px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); width: 280px; color: var(--t-3);}
        .search-bar input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: var(--fs-sm);}
        .seg { display: inline-flex; gap: 2px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px;}
        .seg-btn { border: 0; background: transparent; padding: 4px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500;}
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1);}

        .bk-split { display: grid; grid-template-columns: 360px 1fr; flex: 1; min-height: 0;}
        .bk-list { border-right: 1px solid var(--bd-1); overflow: auto; background: var(--bg-1);}
        .bk-row {
          width: 100%; text-align: left; border: 0; background: transparent;
          padding: 12px 16px;
          border-bottom: 1px solid var(--bd-1);
          cursor: pointer; position: relative;
          font: inherit;
          display: flex; flex-direction: column; gap: 4px;
        }
        .bk-row:hover { background: var(--bg-hover);}
        .bk-row.active { background: var(--bg-elev); box-shadow: inset 3px 0 0 var(--acc);}
        .new-dot { position: absolute; top: 14px; right: 12px; width: 6px; height: 6px; background: var(--acc); border-radius: 999px;}
        .bk-row-top { display: flex; justify-content: space-between; align-items: center;}
        .bk-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); display: inline-flex; align-items: center; gap: 6px;}
        .bk-total { font-size: var(--fs-md); color: var(--t-1); font-weight: 600;}
        .bk-row-mid { font-size: var(--fs-xs); color: var(--t-2); display: flex; align-items: center; gap: 5px;}
        .bk-row-bot { font-size: var(--fs-xs); color: var(--t-2); display: flex; align-items: center; gap: 6px; margin-top: 2px;}

        .bk-detail { overflow: auto; background: var(--bg);}
        .bd-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 24px; border-bottom: 1px solid var(--bd-1); background: var(--bg-1);}
        .bd-id { display: flex; align-items: center; gap: 10px;}
        .bd-num { font-size: 13px; color: var(--t-2); font-weight: 600;}
        .bd-hero { padding: 20px 24px; display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: center; border-bottom: 1px solid var(--bd-1);}
        .bd-guest { display: flex; gap: 12px; align-items: center;}
        .bd-avatar { width: 48px; height: 48px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; font-size: 18px; display: flex; align-items: center; justify-content: center; flex: 0 0 48px;}
        .bd-gname { font-size: var(--fs-xl); font-weight: 600; color: var(--t-1);}
        .bd-stay { background: var(--bg-1); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 18px;}
        .stay-dates { display: flex; gap: 18px; align-items: center;}
        .stay-dates .lbl { color: var(--t-3); margin-bottom: 2px;}
        .stay-dates .day { font-size: 18px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .stay-dates .arrow { color: var(--t-3);}

        .bd-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; padding: 16px 24px;}
        .bd-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 16px;}
        .card-h { font-size: var(--fs-md); font-weight: 600; margin-bottom: 10px; color: var(--t-1);}
        .rt-line { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px;}
        .rt-line .rt-name { font-weight: 500; color: var(--t-1);}
        .rt-line .rt-prc { font-weight: 600; color: var(--t-1);}
        .bd-bill { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; font-size: var(--fs-sm);}
        .bd-bill > div { display: flex; justify-content: space-between; color: var(--t-2);}
        .bd-bill .total { font-weight: 600; color: var(--t-1); font-size: var(--fs-md);}

        .pay-block { display: flex; flex-direction: column; gap: 8px;}
        .pay-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ok); font-size: var(--fs-md);}
        .pay-meta { display: flex; align-items: center; gap: 6px;}
        .req-list { display: flex; flex-direction: column; gap: 8px; font-size: var(--fs-sm);}
        .req { display: flex; align-items: center; gap: 8px; color: var(--t-2);}

        .act-list { display: flex; flex-direction: column; gap: 10px;}
        .act { display: flex; gap: 10px; font-size: var(--fs-sm);}
        .act-d { width: 8px; height: 8px; border-radius: 999px; background: var(--bd-3); margin-top: 5px; flex: 0 0 8px;}
        .act-d.hl { background: var(--acc);}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
      `}</style>
    </div>
  );
};
window.Bookings = Bookings;
