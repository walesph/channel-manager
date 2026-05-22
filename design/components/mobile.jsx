/* global React, I, STR, CHANNELS */
// Mobile views — phone-sized dashboard + booking detail
const MobileDash = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const ch = (id) => CHANNELS.find(c => c.id === id);
  return (
    <div className="m-screen">
      <div className="m-top">
        <div>
          <div className="m-greet text-muted">{lang === 'ko' ? '안녕하세요, 박매니저님' : 'Hi, Manager Park'}</div>
          <div className="m-title">{lang === 'ko' ? '오늘의 운영' : "Today's operations"}</div>
        </div>
        <div className="m-av">민</div>
      </div>

      <div className="m-sync">
        <div className="m-sync-dot"/>
        <span style={{flex: 1, fontSize: 12}}>{lang === 'ko' ? '6개 채널 동기화됨' : '6 channels synced'}</span>
        <span className="text-muted mono" style={{fontSize: 11}}>14:02</span>
      </div>

      <div className="m-kpis">
        <div className="m-kpi">
          <div className="lbl tracker">{lang === 'ko' ? '점유율' : 'Occupancy'}</div>
          <div className="val num">84.2%</div>
          <div className="dlt up">+6.4%</div>
        </div>
        <div className="m-kpi">
          <div className="lbl tracker">{lang === 'ko' ? '오늘 수익' : 'Today rev.'}</div>
          <div className="val num">₩4.8M</div>
          <div className="dlt up">+12%</div>
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-h">
          <span style={{fontWeight: 600, fontSize: 14}}>{lang === 'ko' ? '주의 필요' : 'Needs attention'}</span>
          <span className="pill bad">3</span>
        </div>
        <div className="m-issue bad">
          <div className="m-iico"><I.warn size={14}/></div>
          <div style={{flex: 1}}>
            <div style={{fontWeight: 600, fontSize: 13}}>{lang === 'ko' ? '오버부킹: 디럭스 더블' : 'Overbooking: Deluxe'}</div>
            <div className="text-muted" style={{fontSize: 11}}>1/15 · Agoda</div>
          </div>
          <I.chevR size={14} style={{color: 'var(--t-3)'}}/>
        </div>
        <div className="m-issue warn">
          <div className="m-iico"><I.warn size={14}/></div>
          <div style={{flex: 1}}>
            <div style={{fontWeight: 600, fontSize: 13}}>{lang === 'ko' ? 'FB 동기화 지연' : 'FB sync delayed'}</div>
            <div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '6건 대기' : '6 pending'}</div>
          </div>
          <I.chevR size={14} style={{color: 'var(--t-3)'}}/>
        </div>
      </div>

      <div className="m-card">
        <div className="m-card-h">
          <span style={{fontWeight: 600, fontSize: 14}}>{lang === 'ko' ? '오늘 체크인' : 'Arrivals'}</span>
          <span className="text-muted" style={{fontSize: 12}}>5</span>
        </div>
        {[
          { name: '김도윤', ch: 'airbnb', t: '15:30', rm: '1208', flag: '🇰🇷' },
          { name: 'Sato', ch: 'booking', t: '16:00', rm: '0805', flag: '🇯🇵' },
          { name: 'Chen', ch: 'agoda', t: '17:15', rm: '1405', flag: '🇨🇳' },
        ].map((g, i) => (
          <div key={i} className="m-arr">
            <span className="flag" style={{fontSize: 18}}>{g.flag}</span>
            <div style={{flex: 1}}>
              <div style={{fontWeight: 500, fontSize: 13}}>{g.name}</div>
              <div className="mini-ch" style={{fontSize: 10}}><span className={`dot ${ch(g.ch).cls}`}/>{ch(g.ch).name}</div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div className="num" style={{fontSize: 13, fontWeight: 600}}>{g.t}</div>
              <div className="num text-muted" style={{fontSize: 11}}>{g.rm}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="m-tabbar">
        {[
          { id: 'home', icon: <I.home size={18}/>, lbl: lang === 'ko' ? '홈' : 'Home', active: true },
          { id: 'cal',  icon: <I.cal size={18}/>,  lbl: lang === 'ko' ? '캘린더' : 'Cal' },
          { id: 'bk',   icon: <I.inbox size={18}/>,lbl: lang === 'ko' ? '예약' : 'Book', badge: 14 },
          { id: 'msg',  icon: <I.msg size={18}/>,  lbl: lang === 'ko' ? '메시지' : 'Msg', badge: 6 },
          { id: 'me',   icon: <I.user size={18}/>, lbl: lang === 'ko' ? '내정보' : 'Me' },
        ].map(b => (
          <button key={b.id} className={`m-tab ${b.active ? 'active' : ''}`}>
            <div style={{position: 'relative'}}>
              {b.icon}
              {b.badge && <span className="tab-badge">{b.badge}</span>}
            </div>
            <span>{b.lbl}</span>
          </button>
        ))}
      </div>

      <style>{`
        .m-screen { background: var(--bg-1); height: 100%; overflow: auto; padding: 12px 16px 80px; display: flex; flex-direction: column; gap: 12px;}
        .m-top { display: flex; justify-content: space-between; align-items: center; padding: 8px 0;}
        .m-greet { font-size: 12px;}
        .m-title { font-size: 22px; font-weight: 600; color: var(--t-1); letter-spacing: -0.01em;}
        .m-av { width: 36px; height: 36px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; display: flex; align-items: center; justify-content: center;}
        .m-sync { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md);}
        .m-sync-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--ok); box-shadow: 0 0 0 4px rgba(22,163,74,0.15);}
        .m-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px;}
        .m-kpi { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px 14px;}
        .m-kpi .lbl { font-size: 10px; color: var(--t-3);}
        .m-kpi .val { font-size: 22px; font-weight: 600; margin: 4px 0 2px; letter-spacing: -0.02em;}
        .m-kpi .dlt { font-size: 11px; font-weight: 600;}
        .m-kpi .dlt.up { color: var(--ok);}
        .m-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;}
        .m-card-h { display: flex; justify-content: space-between; align-items: center;}
        .m-issue { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--bd-1);}
        .m-iico { width: 28px; height: 28px; border-radius: 999px; display: flex; align-items: center; justify-content: center; flex: 0 0 28px;}
        .m-issue.bad .m-iico { background: var(--bad-soft); color: var(--bad);}
        .m-issue.warn .m-iico { background: var(--warn-soft); color: var(--warn);}
        .m-arr { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--bd-1);}
        .m-tabbar { position: absolute; bottom: 0; left: 0; right: 0; display: grid; grid-template-columns: repeat(5, 1fr); background: var(--bg-elev); border-top: 1px solid var(--bd-1); padding: 6px 0 14px;}
        .m-tab { background: transparent; border: 0; font: inherit; padding: 6px; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--t-3); cursor: pointer; font-size: 10px;}
        .m-tab.active { color: var(--acc);}
        .tab-badge { position: absolute; top: -4px; right: -8px; background: var(--bad); color: white; font-size: 9px; min-width: 14px; height: 14px; border-radius: 999px; display: flex; align-items: center; justify-content: center; padding: 0 4px;}
        .mini-ch { display: inline-flex; align-items: center; gap: 4px; color: var(--t-3);}
        .mini-ch .dot { width: 5px; height: 5px; border-radius: 1px;}
      `}</style>
    </div>
  );
};
window.MobileDash = MobileDash;

const MobileCal = ({ lang = 'ko' }) => {
  const ch = (id) => CHANNELS.find(c => c.id === id);
  const days = ['11','12','13','14','15','16','17'];
  const dows = lang === 'ko' ? ['일','월','화','수','목','금','토'] : ['S','M','T','W','T','F','S'];
  return (
    <div className="m-screen" style={{padding: 0}}>
      <div style={{padding: '14px 16px 8px', borderBottom: '1px solid var(--bd-1)', background: 'var(--bg-elev)'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div className="m-title" style={{fontSize: 20}}>{lang === 'ko' ? '캘린더' : 'Calendar'}</div>
            <div className="text-muted" style={{fontSize: 11}}>{lang === 'ko' ? '2026년 1월' : 'January 2026'}</div>
          </div>
          <button className="btn ghost icon"><I.filter size={14}/></button>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', marginTop: 12, gap: 0}}>
          <div/>
          {days.map((d, i) => (
            <div key={i} style={{textAlign: 'center', padding: '4px 2px'}}>
              <div style={{fontSize: 9, color: 'var(--t-3)'}}>{dows[i]}</div>
              <div style={{fontSize: 13, fontWeight: 600, color: i === 2 ? 'var(--acc)' : 'var(--t-1)'}}>{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding: '0', overflow: 'auto', flex: 1}}>
        {[
          { rt: lang === 'ko' ? '스탠다드' : 'Standard', cells: [9, 10, 12, 11, 12, 12, 8] },
          { rt: lang === 'ko' ? '디럭스' : 'Deluxe', cells: [10, 11, 13, 14, 15, 13, 9] },
          { rt: lang === 'ko' ? '스위트' : 'Suite', cells: [4, 5, 5, 6, 6, 5, 3] },
        ].map((r, ri) => (
          <div key={ri} style={{display: 'grid', gridTemplateColumns: '70px repeat(7, 1fr)', borderBottom: '1px solid var(--bd-1)'}}>
            <div style={{padding: '10px 8px', borderRight: '1px solid var(--bd-1)', fontSize: 11, fontWeight: 500, background: 'var(--bg-1)'}}>{r.rt}</div>
            {r.cells.map((c, i) => {
              const max = ri === 0 ? 12 : ri === 1 ? 14 : 6;
              const over = c > max;
              return (
                <div key={i} style={{padding: '8px 4px', borderRight: '1px solid var(--bd-1)', textAlign: 'center', background: over ? '#fee2e2' : i === 2 ? 'var(--acc-soft)' : 'transparent'}}>
                  <div style={{fontSize: 12, fontWeight: 600, color: over ? 'var(--bad)' : 'var(--t-1)'}}>{over ? `+${c-max}` : (max-c)}</div>
                  <div style={{height: 3, background: 'var(--bg-mute)', borderRadius: 2, marginTop: 4, overflow: 'hidden'}}>
                    <div style={{width: `${Math.min(c/max, 1)*100}%`, height: '100%', background: over ? 'var(--bad)' : 'var(--acc)'}}/>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="m-tabbar">
        {[
          { id: 'home', icon: <I.home size={18}/>, lbl: lang === 'ko' ? '홈' : 'Home' },
          { id: 'cal',  icon: <I.cal size={18}/>,  lbl: lang === 'ko' ? '캘린더' : 'Cal', active: true },
          { id: 'bk',   icon: <I.inbox size={18}/>,lbl: lang === 'ko' ? '예약' : 'Book', badge: 14 },
          { id: 'msg',  icon: <I.msg size={18}/>,  lbl: lang === 'ko' ? '메시지' : 'Msg', badge: 6 },
          { id: 'me',   icon: <I.user size={18}/>, lbl: lang === 'ko' ? '내정보' : 'Me' },
        ].map(b => (
          <button key={b.id} className={`m-tab ${b.active ? 'active' : ''}`}>
            <div style={{position: 'relative'}}>
              {b.icon}
              {b.badge && <span className="tab-badge">{b.badge}</span>}
            </div>
            <span>{b.lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
window.MobileCal = MobileCal;
