/* global React, I, STR, CHANNELS */
// Sidebar — workspace switcher + nav.
const Sidebar = ({ active = 'dashboard', lang = 'ko', onNav }) => {
  const t = STR[lang];
  const Item = ({ id, icon, label, badge, kbd }) => (
    <button
      onClick={() => onNav && onNav(id)}
      className="side-item"
      data-active={active === id ? 'true' : undefined}
    >
      <span className="ic">{icon}</span>
      <span className="lbl">{label}</span>
      {badge ? <span className="badge num">{badge}</span> : null}
      {kbd ? <span className="kbd">{kbd}</span> : null}
    </button>
  );
  return (
    <aside className="sidebar">
      <div className="ws">
        <div className="ws-logo">SL</div>
        <div className="ws-meta">
          <div className="ws-name">{t.workspace}</div>
          <div className="ws-sub">{lang === 'ko' ? '52 객실 · Pro' : '52 rooms · Pro'}</div>
        </div>
        <button className="btn icon ghost" aria-label="switch"><I.chevD size={14}/></button>
      </div>

      <div className="side-search">
        <I.search size={14}/>
        <input placeholder={t.cmd}/>
        <span className="kbd">⌘K</span>
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.workspace}</div>
        <Item id="dashboard" icon={<I.home size={15}/>}     label={t.nav.dashboard} kbd="G D"/>
        <Item id="calendar"  icon={<I.cal size={15}/>}      label={t.nav.calendar}  kbd="G C"/>
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.operations}</div>
        <Item id="bookings" icon={<I.inbox size={15}/>}    label={t.nav.bookings}  badge="14"/>
        <Item id="messages" icon={<I.msg size={15}/>}      label={t.nav.messages}  badge="6"/>
        <Item id="rooms"    icon={<I.bed size={15}/>}      label={t.nav.rooms}/>
      </div>

      <div className="side-section">
        <div className="side-label tracker">{t.sect.growth}</div>
        <Item id="channels" icon={<I.plug size={15}/>}    label={t.nav.channels}/>
        <Item id="revenue"  icon={<I.chart size={15}/>}   label={t.nav.revenue}/>
      </div>

      <div className="side-foot">
        <div className="user-row">
          <div className="avatar">민</div>
          <div className="meta">
            <div className="name">박민지</div>
            <div className="sub text-muted">{lang === 'ko' ? '운영 매니저' : 'Operations Manager'}</div>
          </div>
          <button className="btn icon ghost"><I.setting size={14}/></button>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: var(--side-w); flex: 0 0 var(--side-w);
          background: var(--bg-side);
          border-right: 1px solid var(--bd-1);
          display: flex; flex-direction: column;
          padding: 8px 8px 4px;
          height: 100%;
        }
        .ws {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 6px 6px 6px; margin: 2px 0 8px;
          border-radius: var(--r-md);
          cursor: pointer;
        }
        .ws:hover { background: var(--bg-hover); }
        .ws-logo {
          width: 28px; height: 28px; flex: 0 0 28px;
          border-radius: 6px;
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; font-weight: 700; font-size: 11px;
          display: flex; align-items: center; justify-content: center;
          letter-spacing: 0.5px;
        }
        .ws-meta { flex: 1; min-width: 0; }
        .ws-name { font-size: var(--fs-md); font-weight: 600; color: var(--t-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
        .ws-sub  { font-size: var(--fs-xs); color: var(--t-3); }

        .side-search {
          display: flex; align-items: center; gap: 8px;
          padding: 0 10px;
          height: 30px; margin: 0 2px 14px;
          background: var(--bg);
          border: 1px solid var(--bd-1);
          border-radius: var(--r-sm);
          color: var(--t-3);
        }
        .side-search input {
          flex: 1; border: 0; background: transparent; outline: none;
          font: inherit; font-size: var(--fs-sm); color: var(--t-1);
          min-width: 0;
        }
        .side-search input::placeholder { color: var(--t-4); }

        .side-section { padding: 0 2px 12px; }
        .side-label { padding: 6px 10px 4px; }
        .side-item {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 0 10px; height: var(--row-h);
          border: 0; background: transparent;
          color: var(--t-2); font: inherit; font-size: var(--fs-md);
          border-radius: var(--r-sm); cursor: pointer;
          text-align: left;
        }
        .side-item:hover { background: var(--bg-hover); color: var(--t-1); }
        .side-item[data-active="true"] {
          background: var(--bg-active);
          color: var(--t-1); font-weight: 500;
        }
        .side-item .ic { color: var(--t-3); display: flex; }
        .side-item[data-active="true"] .ic { color: var(--acc); }
        .side-item .lbl { flex: 1; }
        .side-item .badge {
          background: var(--bg-mute); color: var(--t-2);
          padding: 0 6px; min-width: 18px; height: 16px;
          border-radius: 999px; font-size: 10px; text-align: center;
          line-height: 16px; font-weight: 500;
        }
        .side-item[data-active="true"] .badge { background: var(--acc-soft); color: var(--acc-text); }
        .side-item .kbd { opacity: 0; }
        .side-item:hover .kbd { opacity: 1; }

        .side-foot { margin-top: auto; padding: 8px 4px 4px; border-top: 1px solid var(--bd-1); }
        .user-row {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 6px; border-radius: var(--r-sm);
          cursor: pointer;
        }
        .user-row:hover { background: var(--bg-hover); }
        .avatar {
          width: 26px; height: 26px; border-radius: 999px;
          background: #fcd34d; color: #78350f;
          font-size: 11px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          flex: 0 0 26px;
        }
        .user-row .meta { flex: 1; min-width: 0; }
        .user-row .name { font-size: var(--fs-md); font-weight: 500; color: var(--t-1); }
        .user-row .sub  { font-size: var(--fs-xs); }
      `}</style>
    </aside>
  );
};
window.Sidebar = Sidebar;
