/* global React, I, STR, CHANNELS */
// Dashboard — KPI cards, sync issues, arrivals/departures, revenue spark, channel mix

const Sparkline = ({ data, w = 120, h = 32, color = 'var(--acc)', fill = true }) => {
  const max = Math.max(...data), min = Math.min(...data);
  const sx = w / (data.length - 1);
  const sy = (v) => h - 4 - ((v - min) / (max - min || 1)) * (h - 8);
  const pts = data.map((v, i) => `${i * sx},${sy(v)}`).join(' ');
  const area = `M0,${h} L${pts.replace(/,/g, ' ').split(' ').map((v, i) => i % 2 === 0 ? v : v).join(' ')} L${w},${h} Z`;
  const linePath = 'M ' + data.map((v, i) => `${i * sx} ${sy(v)}`).join(' L ');
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={areaPath} fill={color} opacity="0.10"/>}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={(data.length - 1) * sx} cy={sy(data[data.length-1])} r="2.5" fill={color}/>
    </svg>
  );
};

const KPI = ({ label, value, unit, delta, deltaLabel, spark, sparkColor, accent }) => (
  <div className="kpi">
    <div className="kpi-top">
      <span className="kpi-label tracker">{label}</span>
      <button className="btn ghost icon" style={{height: 22, width: 22}}><I.more size={13}/></button>
    </div>
    <div className="kpi-val">
      <span className="num v">{value}</span>
      {unit && <span className="u">{unit}</span>}
    </div>
    <div className="kpi-bot">
      <span className={`delta ${delta >= 0 ? 'up' : 'down'}`}>
        {delta >= 0 ? <I.arrowU size={11}/> : <I.arrowD size={11}/>}
        <span className="num">{Math.abs(delta)}%</span>
      </span>
      <span className="kpi-sub text-muted">{deltaLabel}</span>
      <div style={{flex: 1}}/>
      {spark && <Sparkline data={spark} color={sparkColor || 'var(--acc)'} w={80} h={26}/>}
    </div>
    {accent && <div className="accent-bar" style={{background: accent}}/>}
    <style>{`
      .kpi {
        position: relative;
        background: var(--bg-elev); border: 1px solid var(--bd-1);
        border-radius: var(--r-md); padding: 14px 16px 12px;
        display: flex; flex-direction: column; gap: 6px;
        min-height: 112px;
        overflow: hidden;
      }
      .kpi-top { display: flex; align-items: center; justify-content: space-between; }
      .kpi-label { color: var(--t-3); }
      .kpi-val { display: flex; align-items: baseline; gap: 4px; margin: 2px 0; }
      .kpi-val .v { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; color: var(--t-1); }
      .kpi-val .u { font-size: var(--fs-md); color: var(--t-3); font-weight: 500; }
      .kpi-bot { display: flex; align-items: center; gap: 8px; }
      .delta { display: inline-flex; align-items: center; gap: 2px; font-size: var(--fs-xs); font-weight: 500; padding: 2px 6px; border-radius: 4px; }
      .delta.up   { color: var(--ok); background: var(--ok-soft); }
      .delta.down { color: var(--bad); background: var(--bad-soft); }
      .kpi-sub { font-size: var(--fs-xs); }
      .accent-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; }
    `}</style>
  </div>
);

const Dashboard = ({ lang = 'ko' }) => {
  const t = STR[lang];
  // Sample data
  const occSpark = [62, 65, 71, 68, 74, 78, 82, 80, 84, 79, 83, 86, 88, 85];
  const revSpark = [22, 28, 26, 31, 29, 35, 38, 34, 41, 39, 44, 47, 45, 49];
  const adrSpark = [128, 132, 130, 135, 138, 134, 142, 145, 141, 148, 152, 150, 156, 160];
  const bookSpark = [12, 14, 11, 18, 16, 22, 19, 25, 23, 28, 26, 31, 29, 34];

  const arrivals = [
    { name: '김도윤', en: 'Kim Doyun', room: '1208', ch: 'airbnb',  nights: 3, time: '15:30', flag: '🇰🇷', vip: true },
    { name: '佐藤美咲', en: 'Sato M.',   room: '0805', ch: 'booking', nights: 5, time: '16:00', flag: '🇯🇵' },
    { name: 'M. Chen',  en: 'M. Chen',   room: '1405', ch: 'agoda',   nights: 2, time: '17:15', flag: '🇨🇳' },
    { name: 'J. Smith', en: 'J. Smith',  room: '0902', ch: 'direct',  nights: 4, time: '18:00', flag: '🇺🇸' },
    { name: '박서연',  en: 'Park S.',    room: '1102', ch: 'trip',    nights: 1, time: '20:30', flag: '🇰🇷' },
  ];

  const issues = [
    { type: 'bad',  ch: 'agoda',   title: lang === 'ko' ? '오버부킹: 디럭스 더블 (12/15)' : 'Overbooking: Deluxe Double (Dec 15)', sub: lang === 'ko' ? '재고 1, 예약 2 — 즉시 조치 필요' : 'Stock 1, bookings 2 — needs action' },
    { type: 'warn', ch: 'fb',      title: lang === 'ko' ? '페이스북 동기화 지연 8분' : 'Facebook sync delayed 8min',  sub: lang === 'ko' ? '6개 신규 예약 처리 대기' : '6 new bookings pending' },
    { type: 'warn', ch: 'booking', title: lang === 'ko' ? 'ADR 채널 편차 12% 초과' : 'ADR channel variance >12%',     sub: lang === 'ko' ? 'Booking.com 가격이 기준 대비 12.4% 낮음' : 'Booking.com 12.4% below baseline' },
    { type: 'info', ch: 'airbnb',  title: lang === 'ko' ? 'AI: 1/14-1/16 가격 인상 추천' : 'AI: Raise rates Jan 14-16', sub: lang === 'ko' ? '주변 평균 +18% — 공실 위험 낮음' : 'Comp set +18% — low vacancy risk' },
  ];

  const channelMix = [
    { id: 'airbnb',  pct: 32, rev: 18420, count: 142 },
    { id: 'booking', pct: 28, rev: 16108, count: 124 },
    { id: 'agoda',   pct: 14, rev: 8050,  count: 62  },
    { id: 'trip',    pct: 11, rev: 6325,  count: 49  },
    { id: 'direct',  pct: 12, rev: 6900,  count: 38  },
    { id: 'fb',      pct: 3,  rev: 1725,  count: 12  },
  ];

  const ch = (id) => CHANNELS.find(c => c.id === id);

  return (
    <div className="page">
      {/* KPI row */}
      <div className="kpi-row">
        <KPI label={t.occupancy} value="84.2" unit="%" delta={6.4} deltaLabel={lang === 'ko' ? '전주 대비' : 'vs last week'} spark={occSpark} sparkColor="#16a34a" accent="var(--ok)"/>
        <KPI label={t.adr}        value="₩158,400" delta={3.1} deltaLabel={lang === 'ko' ? '전주 대비' : 'vs last week'} spark={adrSpark} sparkColor="#4f46e5" accent="var(--acc)"/>
        <KPI label={t.revpar}     value="₩133,376" delta={9.7} deltaLabel={lang === 'ko' ? '전주 대비' : 'vs last week'} spark={revSpark} sparkColor="#0284c7" accent="var(--info)"/>
        <KPI label={t.bookings}   value="34" unit={lang === 'ko' ? '건' : 'today'} delta={-2.1} deltaLabel={lang === 'ko' ? '어제 대비' : 'vs yesterday'} spark={bookSpark} sparkColor="#ea580c" accent="var(--warn)"/>
      </div>

      <div className="dash-grid">
        {/* Sync issues */}
        <section className="card span-7">
          <div className="sec-h">
            <div>
              <div className="title">{lang === 'ko' ? '주의 필요' : 'Needs attention'}</div>
              <div className="sub">{lang === 'ko' ? '4건의 이슈와 추천' : '4 issues and suggestions'}</div>
            </div>
            <div style={{display: 'flex', gap: 6}}>
              <button className="btn sm ghost"><I.filter size={12}/> {lang === 'ko' ? '필터' : 'Filter'}</button>
              <button className="btn sm">{lang === 'ko' ? '전체 보기' : 'View all'}</button>
            </div>
          </div>
          <div className="issues">
            {issues.map((it, i) => (
              <div key={i} className={`issue ${it.type}`}>
                <div className="ic">
                  {it.type === 'bad'  && <I.warn  size={14}/>}
                  {it.type === 'warn' && <I.warn  size={14}/>}
                  {it.type === 'info' && <I.sparkle size={14}/>}
                </div>
                <div className="body">
                  <div className="t">{it.title}</div>
                  <div className="s">
                    <span className={`mini-ch`}>
                      <span className={`dot ${ch(it.ch)?.cls}`}/>{ch(it.ch)?.name}
                    </span>
                    <span className="text-muted">·</span>
                    <span>{it.sub}</span>
                  </div>
                </div>
                <div className="actions">
                  <button className="btn sm">{lang === 'ko' ? '해결' : 'Resolve'}</button>
                  <button className="btn ghost icon sm"><I.close size={12}/></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI suggestion */}
        <section className="card span-5 ai-card">
          <div className="sec-h">
            <div className="title" style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <I.sparkle size={14}/>
              {t.aiPrice}
            </div>
            <span className="pill acc dot" style={{textTransform: 'none'}}>Beta</span>
          </div>
          <div className="ai-body">
            <div className="ai-headline">
              <div className="num big">+₩2,840,000</div>
              <div className="text-muted" style={{fontSize: 12}}>
                {lang === 'ko' ? '다음 14일 추가 수익 (추천 적용 시)' : 'Extra revenue next 14 days (if applied)'}
              </div>
            </div>
            <div className="ai-list">
              {[
                { d: lang === 'ko' ? '1월 14일 (금)' : 'Fri Jan 14', ch: 'airbnb',  rt: lang === 'ko' ? '디럭스 트윈' : 'Deluxe Twin',  cur: 142000, sug: 168000 },
                { d: lang === 'ko' ? '1월 15일 (토)' : 'Sat Jan 15', ch: 'booking', rt: lang === 'ko' ? '디럭스 더블' : 'Deluxe Double', cur: 158000, sug: 198000 },
                { d: lang === 'ko' ? '1월 16일 (일)' : 'Sun Jan 16', ch: 'agoda',   rt: lang === 'ko' ? '스위트' : 'Suite King',   cur: 245000, sug: 268000 },
              ].map((s, i) => (
                <div key={i} className="ai-row">
                  <div className="day">{s.d}</div>
                  <div className="rt">
                    <span className={`dot ${ch(s.ch)?.cls}`}/> {s.rt}
                  </div>
                  <div className="prc">
                    <span className="old num">₩{s.cur.toLocaleString()}</span>
                    <I.arrowR size={11}/>
                    <span className="new num">₩{s.sug.toLocaleString()}</span>
                    <span className="up num">+{Math.round((s.sug - s.cur) / s.cur * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="ai-foot">
              <button className="btn primary"><I.zap size={13}/> {lang === 'ko' ? '추천 모두 적용' : 'Apply all'}</button>
              <button className="btn ghost">{lang === 'ko' ? '검토하기' : 'Review'}</button>
            </div>
          </div>
        </section>

        {/* Today's arrivals */}
        <section className="card span-7">
          <div className="sec-h">
            <div>
              <div className="title">{lang === 'ko' ? '오늘 체크인' : "Today's arrivals"}</div>
              <div className="sub">12 {lang === 'ko' ? '건' : 'guests'} · 5 {lang === 'ko' ? '대기 중' : 'pending'}</div>
            </div>
            <button className="btn sm ghost">{lang === 'ko' ? '전체' : 'View all'} <I.chevR size={12}/></button>
          </div>
          <table className="t-list">
            <thead>
              <tr>
                <th>{lang === 'ko' ? '게스트' : 'Guest'}</th>
                <th>{lang === 'ko' ? '객실' : 'Room'}</th>
                <th>{lang === 'ko' ? '채널' : 'Channel'}</th>
                <th className="r">{lang === 'ko' ? '박' : 'Nights'}</th>
                <th className="r">{lang === 'ko' ? '도착' : 'ETA'}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((g, i) => (
                <tr key={i}>
                  <td>
                    <div className="g-cell">
                      <span className="flag">{g.flag}</span>
                      <span className="g-name">{lang === 'ko' ? g.name : g.en}</span>
                      {g.vip && <span className="pill warn" style={{height: 16, fontSize: 10, padding: '0 5px'}}>VIP</span>}
                    </div>
                  </td>
                  <td className="num">{g.room}</td>
                  <td>
                    <span className="mini-ch">
                      <span className={`dot ${ch(g.ch)?.cls}`}/>{ch(g.ch)?.name}
                    </span>
                  </td>
                  <td className="r num">{g.nights}</td>
                  <td className="r num">{g.time}</td>
                  <td className="r">
                    <button className="btn sm ghost"><I.more size={12}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Channel mix */}
        <section className="card span-5">
          <div className="sec-h">
            <div>
              <div className="title">{lang === 'ko' ? '채널 믹스 (이번 달)' : 'Channel mix (MTD)'}</div>
              <div className="sub">₩57.5M · 427 {lang === 'ko' ? '예약' : 'bookings'}</div>
            </div>
            <button className="btn sm ghost"><I.chevD size={12}/> {lang === 'ko' ? '이번 달' : 'This month'}</button>
          </div>
          <div className="ch-mix">
            {/* Stacked bar */}
            <div className="mix-bar">
              {channelMix.map(m => (
                <div key={m.id} className="seg" style={{flex: m.pct, background: `var(--ch-${m.id})`}} title={`${ch(m.id)?.name} ${m.pct}%`}/>
              ))}
            </div>
            <div className="mix-list">
              {channelMix.map(m => (
                <div key={m.id} className="mix-row">
                  <span className="mini-ch">
                    <span className={`dot ${ch(m.id)?.cls}`}/>{ch(m.id)?.name}
                  </span>
                  <div className="pct-bar">
                    <div className="fill" style={{width: `${m.pct * 3}%`, background: `var(--ch-${m.id})`}}/>
                  </div>
                  <span className="num pct">{m.pct}%</span>
                  <span className="num rev">₩{(m.rev / 1000).toFixed(1)}K</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <style>{`
        .page { padding: 20px 24px 32px; display: flex; flex-direction: column; gap: 16px; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .dash-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 12px; }
        .span-5 { grid-column: span 5; }
        .span-7 { grid-column: span 7; }

        .issues { display: flex; flex-direction: column; }
        .issue {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          gap: 12px; align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--bd-1);
        }
        .issue:last-child { border-bottom: 0; }
        .issue .ic {
          width: 28px; height: 28px; border-radius: 999px;
          display: flex; align-items: center; justify-content: center;
        }
        .issue.bad  .ic { background: var(--bad-soft); color: var(--bad); }
        .issue.warn .ic { background: var(--warn-soft); color: var(--warn); }
        .issue.info .ic { background: var(--acc-soft); color: var(--acc); }
        .issue .t { font-weight: 500; color: var(--t-1); margin-bottom: 2px; font-size: var(--fs-md); }
        .issue .s { font-size: var(--fs-xs); color: var(--t-3); display: flex; align-items: center; gap: 6px; }
        .issue .actions { display: flex; gap: 4px; }
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}

        .ai-card { background: linear-gradient(180deg, var(--acc-soft) 0%, var(--bg-elev) 60%); }
        .theme-dark .ai-card { background: linear-gradient(180deg, rgba(79,70,229,0.12) 0%, var(--bg-elev) 70%); }
        .ai-body { padding: 0 16px 16px; }
        .ai-headline { padding: 12px 0 16px; border-bottom: 1px solid var(--bd-1); }
        .ai-headline .big { font-size: 28px; font-weight: 600; color: var(--ok); letter-spacing: -0.02em; }
        .ai-list { display: flex; flex-direction: column; padding: 8px 0; }
        .ai-row {
          display: grid;
          grid-template-columns: 1.2fr 1.4fr auto;
          align-items: center; gap: 8px;
          padding: 8px 0;
          font-size: var(--fs-sm);
        }
        .ai-row .day { color: var(--t-2); font-weight: 500; }
        .ai-row .rt { color: var(--t-2); display: flex; align-items: center; gap: 6px;}
        .ai-row .rt .dot { width: 7px; height: 7px; border-radius: 2px; }
        .ai-row .prc { display: flex; align-items: center; gap: 6px; }
        .ai-row .old { color: var(--t-3); text-decoration: line-through; font-size: var(--fs-xs);}
        .ai-row .new { color: var(--t-1); font-weight: 600; }
        .ai-row .up  { color: var(--ok); font-size: var(--fs-xs); font-weight: 600; }
        .ai-foot { display: flex; gap: 8px; padding-top: 8px; }

        .t-list { width: 100%; border-collapse: collapse; font-size: var(--fs-md); }
        .t-list th {
          font-weight: 500; color: var(--t-3);
          text-align: left; padding: 8px 16px;
          font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.04em;
          background: var(--bg-1);
          border-bottom: 1px solid var(--bd-1);
        }
        .t-list th.r, .t-list td.r { text-align: right; }
        .t-list td { padding: 10px 16px; border-bottom: 1px solid var(--bd-1); color: var(--t-1); font-variant-numeric: tabular-nums;}
        .t-list tr:last-child td { border-bottom: 0; }
        .t-list tr:hover td { background: var(--bg-1); }
        .g-cell { display: flex; align-items: center; gap: 8px; }
        .flag { font-size: 14px; }
        .g-name { font-weight: 500; color: var(--t-1); }

        .ch-mix { padding: 12px 16px 16px; }
        .mix-bar { display: flex; height: 10px; border-radius: 999px; overflow: hidden; gap: 2px; margin-bottom: 14px; }
        .mix-list { display: flex; flex-direction: column; gap: 8px; }
        .mix-row { display: grid; grid-template-columns: 110px 1fr 40px 60px; align-items: center; gap: 10px; font-size: var(--fs-sm); }
        .pct-bar { background: var(--bg-mute); height: 6px; border-radius: 999px; overflow: hidden; }
        .pct-bar .fill { height: 100%; border-radius: 999px;}
        .pct { color: var(--t-2); text-align: right; font-weight: 500;}
        .rev { color: var(--t-3); text-align: right; }
      `}</style>
    </div>
  );
};
window.Dashboard = Dashboard;
