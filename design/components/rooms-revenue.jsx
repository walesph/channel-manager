/* global React, I, STR, CHANNELS */
const { useState: useState_r } = React;

// Rooms & Rates settings + Revenue dashboard
const Rooms = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const ch = (id) => CHANNELS.find(c => c.id === id);

  const rooms = [
    { id: 'std-double', name: { ko: '스탠다드 더블', en: 'Standard Double' }, count: 12, sqm: 22, max: 2, base: 98000, photo: '#fde68a' },
    { id: 'std-twin',   name: { ko: '스탠다드 트윈', en: 'Standard Twin' },   count: 10, sqm: 24, max: 2, base: 102000, photo: '#bfdbfe' },
    { id: 'dlx-double', name: { ko: '디럭스 더블',   en: 'Deluxe Double' },   count: 14, sqm: 28, max: 2, base: 142000, photo: '#fbcfe8' },
    { id: 'dlx-twin',   name: { ko: '디럭스 트윈',   en: 'Deluxe Twin' },     count: 10, sqm: 30, max: 2, base: 148000, photo: '#bbf7d0' },
    { id: 'suite-king', name: { ko: '스위트 킹',     en: 'Suite King' },      count: 6,  sqm: 48, max: 4, base: 245000, photo: '#ddd6fe' },
  ];

  return (
    <div className="page">
      <div className="rm-tabs">
        <button className="rm-tab active">{lang === 'ko' ? '객실 타입' : 'Room types'} <span className="num">5</span></button>
        <button className="rm-tab">{lang === 'ko' ? '요금제' : 'Rate plans'} <span className="num">8</span></button>
        <button className="rm-tab">{lang === 'ko' ? '프로모션' : 'Promotions'} <span className="num">3</span></button>
        <button className="rm-tab">{lang === 'ko' ? '정책' : 'Policies'}</button>
        <div style={{flex: 1}}/>
        <button className="btn primary"><I.plus size={13}/> {lang === 'ko' ? '객실 타입 추가' : 'New room type'}</button>
      </div>

      <section className="card">
        <table className="t-list rm-tbl">
          <thead>
            <tr>
              <th>{lang === 'ko' ? '객실 타입' : 'Room type'}</th>
              <th className="r">{lang === 'ko' ? '객실 수' : 'Rooms'}</th>
              <th className="r">{lang === 'ko' ? '면적' : 'Size'}</th>
              <th className="r">{lang === 'ko' ? '최대' : 'Max'}</th>
              <th className="r">{lang === 'ko' ? '기준가' : 'Base rate'}</th>
              <th>{lang === 'ko' ? '채널 가격' : 'Channel rates'}</th>
              <th>{lang === 'ko' ? '연동' : 'Channels'}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{display:'flex', gap: 10, alignItems: 'center'}}>
                    <div style={{width: 36, height: 28, borderRadius: 4, background: r.photo, flex: '0 0 36px'}}/>
                    <div>
                      <div style={{fontWeight: 600}}>{r.name[lang]}</div>
                      <div className="text-muted" style={{fontSize: 11}}>{r.id}</div>
                    </div>
                  </div>
                </td>
                <td className="r num">{r.count}</td>
                <td className="r num">{r.sqm}㎡</td>
                <td className="r num">{r.max}</td>
                <td className="r num" style={{fontWeight: 600}}>₩{r.base.toLocaleString()}</td>
                <td>
                  <div className="ch-rate-grid">
                    {['airbnb','booking','agoda','trip','direct'].map(c => {
                      const m = c === 'airbnb' ? 1.0 : c === 'booking' ? 0.95 : c === 'agoda' ? 0.97 : c === 'trip' ? 0.96 : 0.92;
                      return (
                        <div key={c} className="ch-rate-mini">
                          <span className={`dot ${ch(c).cls}`}/>
                          <span className="num">{Math.round(r.base * m / 1000)}K</span>
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td>
                  <div style={{display: 'flex', gap: 3}}>
                    {['airbnb','booking','agoda','trip','direct'].map(c => (
                      <span key={c} className={`dot ${ch(c).cls}`} style={{width: 10, height: 10, borderRadius: 2}} title={ch(c).name}/>
                    ))}
                  </div>
                </td>
                <td className="r"><button className="btn sm ghost"><I.edit size={11}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="rm-grid">
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === 'ko' ? '취소 정책' : 'Cancellation policy'}</div>
            <button className="btn sm ghost"><I.edit size={11}/> {lang === 'ko' ? '편집' : 'Edit'}</button>
          </div>
          <div style={{padding: 16}}>
            <div className="policy-row">
              <span className="pill ok">{lang === 'ko' ? '7일 이상' : '7+ days'}</span>
              <span>{lang === 'ko' ? '전액 환불' : 'Full refund'}</span>
            </div>
            <div className="policy-row">
              <span className="pill warn">{lang === 'ko' ? '3-7일' : '3-7 days'}</span>
              <span>{lang === 'ko' ? '50% 환불' : '50% refund'}</span>
            </div>
            <div className="policy-row">
              <span className="pill bad">{lang === 'ko' ? '3일 이내' : '< 3 days'}</span>
              <span>{lang === 'ko' ? '환불 불가' : 'Non-refundable'}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === 'ko' ? '체크인/아웃' : 'Check-in / out'}</div>
            <button className="btn sm ghost"><I.edit size={11}/></button>
          </div>
          <div style={{padding: 16, display: 'flex', flexDirection: 'column', gap: 8}}>
            <div className="policy-row"><span className="text-muted">{lang === 'ko' ? '체크인' : 'Check-in'}</span><span className="num">15:00 — 23:00</span></div>
            <div className="policy-row"><span className="text-muted">{lang === 'ko' ? '체크아웃' : 'Check-out'}</span><span className="num">11:00</span></div>
            <div className="policy-row"><span className="text-muted">{lang === 'ko' ? '얼리 체크인' : 'Early check-in'}</span><span>+₩30,000</span></div>
            <div className="policy-row"><span className="text-muted">{lang === 'ko' ? '레이트 체크아웃' : 'Late check-out'}</span><span>+₩20,000 (14:00)</span></div>
          </div>
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === 'ko' ? '활성 프로모션' : 'Active promotions'}</div>
            <button className="btn sm">{lang === 'ko' ? '신규' : 'New'}</button>
          </div>
          <div style={{padding: 16, display: 'flex', flexDirection: 'column', gap: 10}}>
            <div className="promo">
              <div><div style={{fontWeight: 600}}>{lang === 'ko' ? '얼리버드 -15%' : 'Early Bird -15%'}</div><div className="text-muted" style={{fontSize: 11}}>30+ {lang === 'ko' ? '일 전 예약' : 'days advance'}</div></div>
              <span className="pill ok dot">{lang === 'ko' ? '활성' : 'Active'}</span>
            </div>
            <div className="promo">
              <div><div style={{fontWeight: 600}}>{lang === 'ko' ? '5박 이상 -10%' : '5+ Nights -10%'}</div><div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '직접 예약 한정' : 'Direct only'}</div></div>
              <span className="pill ok dot">{lang === 'ko' ? '활성' : 'Active'}</span>
            </div>
            <div className="promo">
              <div><div style={{fontWeight: 600}}>{lang === 'ko' ? '주중 특가' : 'Midweek deal'}</div><div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '월-목 -₩20K' : 'Mon-Thu -₩20K'}</div></div>
              <span className="pill warn dot">{lang === 'ko' ? '예정' : 'Scheduled'}</span>
            </div>
          </div>
        </section>
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
};
window.Rooms = Rooms;

// Revenue analytics
const Revenue = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const ch = (id) => CHANNELS.find(c => c.id === id);

  // Bar chart data — monthly revenue by channel for 6 months
  const months = lang === 'ko' ? ['8월','9월','10월','11월','12월','1월'] : ['Aug','Sep','Oct','Nov','Dec','Jan'];
  const data = [
    { air: 14, bk: 12, ag: 7,  tr: 5,  dr: 5,  fb: 1 },
    { air: 16, bk: 13, ag: 8,  tr: 6,  dr: 6,  fb: 1 },
    { air: 15, bk: 11, ag: 6,  tr: 5,  dr: 7,  fb: 2 },
    { air: 18, bk: 15, ag: 9,  tr: 7,  dr: 7,  fb: 2 },
    { air: 22, bk: 18, ag: 10, tr: 9,  dr: 8,  fb: 3 },
    { air: 18, bk: 16, ag: 8,  tr: 6,  dr: 7,  fb: 2 },
  ];
  const max = 60;
  const chs = [
    { k: 'air', id: 'airbnb' },{ k: 'bk', id: 'booking' },{ k: 'ag', id: 'agoda' },
    { k: 'tr', id: 'trip' },{ k: 'dr', id: 'direct' },{ k: 'fb', id: 'fb' },
  ];

  return (
    <div className="page">
      <div className="rev-tools">
        <div className="seg">
          <button className="seg-btn">7d</button>
          <button className="seg-btn">30d</button>
          <button className="seg-btn active">90d</button>
          <button className="seg-btn">YTD</button>
          <button className="seg-btn">All</button>
        </div>
        <div style={{flex: 1}}/>
        <button className="btn sm ghost"><I.cal size={12}/> {lang === 'ko' ? '비교: 전년' : 'Compare: LY'}</button>
        <button className="btn sm ghost"><I.download size={12}/> {lang === 'ko' ? '내보내기' : 'Export'}</button>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-top"><span className="kpi-label tracker">{lang === 'ko' ? '총 수익' : 'Total revenue'}</span></div><div className="kpi-val"><span className="num v">₩57.5M</span></div><div className="kpi-bot"><span className="delta up"><I.arrowU size={11}/><span className="num">12.4%</span></span><span className="kpi-sub text-muted">{lang === 'ko' ? '전년 동기' : 'vs LY'}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label tracker">RevPAR</span></div><div className="kpi-val"><span className="num v">₩133.4K</span></div><div className="kpi-bot"><span className="delta up"><I.arrowU size={11}/><span className="num">9.7%</span></span><span className="kpi-sub text-muted">{lang === 'ko' ? '전년 동기' : 'vs LY'}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label tracker">ADR</span></div><div className="kpi-val"><span className="num v">₩158.4K</span></div><div className="kpi-bot"><span className="delta up"><I.arrowU size={11}/><span className="num">3.1%</span></span><span className="kpi-sub text-muted">{lang === 'ko' ? '전년 동기' : 'vs LY'}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-label tracker">{lang === 'ko' ? '점유율' : 'Occupancy'}</span></div><div className="kpi-val"><span className="num v">84.2%</span></div><div className="kpi-bot"><span className="delta up"><I.arrowU size={11}/><span className="num">6.4%</span></span><span className="kpi-sub text-muted">{lang === 'ko' ? '전년 동기' : 'vs LY'}</span></div></div>
      </div>

      <section className="card" style={{marginTop: 12}}>
        <div className="sec-h">
          <div>
            <div className="title">{lang === 'ko' ? '채널별 수익 (6개월)' : 'Revenue by channel (6mo)'}</div>
            <div className="sub">₩340.2M {lang === 'ko' ? '누적' : 'total'}</div>
          </div>
          <div className="chart-legend">
            {chs.map(c => <span key={c.k} className="lg"><span className={`dot ${ch(c.id).cls}`}/>{ch(c.id).name}</span>)}
          </div>
        </div>
        <div className="bar-chart">
          <div className="y-axis">
            {[60, 45, 30, 15, 0].map(v => <div key={v} className="y-tick"><span className="num">{v}M</span></div>)}
          </div>
          <div className="bars">
            {data.map((d, i) => {
              const total = d.air + d.bk + d.ag + d.tr + d.dr + d.fb;
              return (
                <div key={i} className="bar-col">
                  <div className="bar-stack">
                    <div className="total-lbl num">₩{total}M</div>
                    {[...chs].reverse().map(c => (
                      <div key={c.k} className="bar-seg" style={{ height: `${(d[c.k] / max) * 100}%`, background: `var(--ch-${c.id})` }} title={`${ch(c.id).name} ₩${d[c.k]}M`}/>
                    ))}
                  </div>
                  <div className="bar-x">{months[i]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="rev-grid">
        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === 'ko' ? '채널 수익성' : 'Channel profitability'}</div>
            <div className="sub">{lang === 'ko' ? '수수료 차감 후' : 'After commissions'}</div>
          </div>
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === 'ko' ? '채널' : 'Channel'}</th>
                <th className="r">{lang === 'ko' ? '수익' : 'Revenue'}</th>
                <th className="r">{lang === 'ko' ? '수수료' : 'Fees'}</th>
                <th className="r">{lang === 'ko' ? '실수령' : 'Net'}</th>
                <th className="r">{lang === 'ko' ? '마진' : 'Margin'}</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: 'direct',  rev: 6.9,  fee: 0,    net: 6.9,  margin: 100 },
                { id: 'fb',      rev: 1.7,  fee: 0,    net: 1.7,  margin: 100 },
                { id: 'airbnb',  rev: 18.4, fee: 2.76, net: 15.6, margin: 85 },
                { id: 'trip',    rev: 6.3,  fee: 0.95, net: 5.4,  margin: 85 },
                { id: 'booking', rev: 16.1, fee: 2.74, net: 13.4, margin: 83 },
                { id: 'agoda',   rev: 8.0,  fee: 1.45, net: 6.6,  margin: 82 },
              ].map(r => (
                <tr key={r.id}>
                  <td><span className="mini-ch"><span className={`dot ${ch(r.id).cls}`}/>{ch(r.id).name}</span></td>
                  <td className="r num">₩{r.rev}M</td>
                  <td className="r num text-muted">−₩{r.fee}M</td>
                  <td className="r num" style={{fontWeight: 600}}>₩{r.net}M</td>
                  <td className="r"><span className={`pill ${r.margin === 100 ? 'ok' : r.margin >= 85 ? 'info' : 'warn'}`}>{r.margin}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <div className="sec-h">
            <div className="title">{lang === 'ko' ? '국가별 수익' : 'Revenue by country'}</div>
            <div className="sub">{lang === 'ko' ? '이번 달' : 'MTD'}</div>
          </div>
          <div style={{padding: 14}}>
            {[
              { f: '🇰🇷', n: lang === 'ko' ? '한국' : 'Korea', v: 38, rev: '₩21.9M' },
              { f: '🇯🇵', n: lang === 'ko' ? '일본' : 'Japan', v: 22, rev: '₩12.6M' },
              { f: '🇨🇳', n: lang === 'ko' ? '중국' : 'China', v: 15, rev: '₩8.6M' },
              { f: '🇺🇸', n: lang === 'ko' ? '미국' : 'USA',   v: 11, rev: '₩6.3M' },
              { f: '🇹🇼', n: lang === 'ko' ? '대만' : 'Taiwan',v: 8,  rev: '₩4.6M' },
              { f: '🇩🇪', n: lang === 'ko' ? '독일' : 'Germany',v: 6, rev: '₩3.5M' },
            ].map((c, i) => (
              <div key={i} className="ctry-row">
                <span className="flag" style={{fontSize: 16}}>{c.f}</span>
                <span style={{flex: 1}}>{c.n}</span>
                <div className="ctry-bar"><div className="fill" style={{width: `${c.v * 2.5}%`}}/></div>
                <span className="num text-muted" style={{width: 36, textAlign: 'right', fontSize: 11}}>{c.v}%</span>
                <span className="num" style={{width: 64, textAlign: 'right', fontWeight: 500}}>{c.rev}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        .rev-tools { display: flex; align-items: center; gap: 6px; padding-bottom: 12px;}
        .seg { display: inline-flex; gap: 2px; background: var(--bg-mute); border: 1px solid var(--bd-1); border-radius: var(--r-sm); padding: 2px;}
        .seg-btn { border: 0; background: transparent; padding: 4px 10px; height: 22px; font: inherit; font-size: var(--fs-xs); color: var(--t-2); border-radius: 4px; cursor: pointer; font-weight: 500;}
        .seg-btn.active { background: var(--bg); color: var(--t-1); box-shadow: var(--shadow-1);}
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;}
        .kpi { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 14px 16px 12px; min-height: 100px;}
        .kpi-top { display: flex; justify-content: space-between;}
        .kpi-label { color: var(--t-3);}
        .kpi-val { display: flex; align-items: baseline; gap: 4px; margin: 4px 0;}
        .kpi-val .v { font-size: 24px; font-weight: 600; color: var(--t-1); letter-spacing: -0.02em;}
        .kpi-bot { display: flex; align-items: center; gap: 8px;}
        .delta { display: inline-flex; align-items: center; gap: 2px; font-size: var(--fs-xs); font-weight: 500; padding: 2px 6px; border-radius: 4px;}
        .delta.up { color: var(--ok); background: var(--ok-soft);}
        .kpi-sub { font-size: var(--fs-xs);}

        .chart-legend { display: flex; gap: 12px; font-size: var(--fs-xs); color: var(--t-3); flex-wrap: wrap;}
        .chart-legend .lg { display: inline-flex; align-items: center; gap: 5px;}
        .chart-legend .dot { width: 8px; height: 8px; border-radius: 2px;}

        .bar-chart { display: grid; grid-template-columns: 50px 1fr; padding: 16px 24px 16px 8px; height: 280px;}
        .y-axis { display: flex; flex-direction: column; justify-content: space-between; padding-right: 8px;}
        .y-tick { font-size: 10px; color: var(--t-4); text-align: right; line-height: 1;}
        .bars { display: grid; grid-template-columns: repeat(6, 1fr); gap: 24px; padding: 0 12px;}
        .bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px;}
        .bar-stack { width: 60%; flex: 1; display: flex; flex-direction: column-reverse; justify-content: flex-start; position: relative;}
        .bar-seg { width: 100%;}
        .bar-seg:first-of-type { border-radius: 4px 4px 0 0;}
        .total-lbl { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 4px; font-size: 11px; font-weight: 600; color: var(--t-2); white-space: nowrap;}
        .bar-x { font-size: var(--fs-xs); color: var(--t-3); font-weight: 500;}

        .rev-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; margin-top: 12px;}
        .ctry-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: var(--fs-sm);}
        .ctry-bar { width: 100px; height: 6px; background: var(--bg-mute); border-radius: 999px; overflow: hidden;}
        .ctry-bar .fill { height: 100%; background: var(--acc); border-radius: 999px;}

        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md);}
        .t-list th { font-weight: 500; color: var(--t-3); text-align: left; padding: 8px 16px; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em; background: var(--bg-1); border-bottom: 1px solid var(--bd-1);}
        .t-list th.r, .t-list td.r { text-align: right;}
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0;}
      `}</style>
    </div>
  );
};
window.Revenue = Revenue;
