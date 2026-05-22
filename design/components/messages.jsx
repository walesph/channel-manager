/* global React, I, STR, CHANNELS */
const { useState: useState_m } = React;

const Messages = ({ lang = 'ko' }) => {
  const t = STR[lang];
  const ch = (id) => CHANNELS.find(c => c.id === id);
  const [sel, setSel] = useState_m(0);

  const threads = [
    { id: 1, ch: 'airbnb',  name: '김도윤',   en: 'Kim Doyun',     last: lang === 'ko' ? '얼리 체크인 가능할까요?' : 'Is early check-in possible?', time: '14:21', unread: 1, flag: '🇰🇷' },
    { id: 2, ch: 'booking', name: 'Sato M.',  en: 'Sato Misaki',  last: lang === 'ko' ? '감사합니다. 곧 뵙겠습니다.' : 'Thanks. See you soon.', time: '13:08', unread: 0, flag: '🇯🇵' },
    { id: 3, ch: 'fb',      name: 'Anna L.',  en: 'Anna Larsson',  last: lang === 'ko' ? 'Hi! Do you have rooms for…' : 'Hi! Do you have rooms for…', time: '12:42', unread: 2, flag: '🇸🇪' },
    { id: 4, ch: 'agoda',   name: 'M. Chen',  en: 'Michael Chen',  last: lang === 'ko' ? '주차장 이용 가능?' : 'Is parking available?', time: '11:30', unread: 1, flag: '🇨🇳' },
    { id: 5, ch: 'direct',  name: 'J. Smith', en: 'James Smith',   last: lang === 'ko' ? '예약 변경 요청드립니다' : 'Request to modify reservation', time: '10:15', unread: 1, flag: '🇺🇸' },
    { id: 6, ch: 'trip',    name: '박서연',   en: 'Park Seoyeon',  last: lang === 'ko' ? '체크아웃 시간 연장 가능?' : 'Late check-out possible?', time: '09:48', unread: 0, flag: '🇰🇷' },
  ];

  const cur = threads[sel];

  const msgs = [
    { from: 'them', text: lang === 'ko' ? '안녕하세요! 1월 13일 예약했습니다.' : 'Hi! I have a booking for Jan 13.', time: '14:18' },
    { from: 'them', text: lang === 'ko' ? '비행기가 일찍 도착해서요, 혹시 얼리 체크인 가능할까요? 12시쯤 도착 예정이에요.' : 'My flight arrives early — would early check-in around noon be possible?', time: '14:21' },
  ];

  return (
    <div className="msg-wrap">
      <div className="msg-list">
        <div className="ml-head">
          <div className="ml-tabs">
            <button className="tab active">{lang === 'ko' ? '받은 편지함' : 'Inbox'} <span className="cnt num">5</span></button>
            <button className="tab">{lang === 'ko' ? '대기' : 'Pending'}</button>
            <button className="tab">{lang === 'ko' ? '완료' : 'Done'}</button>
          </div>
          <div className="search-bar" style={{margin: '8px 12px 4px', width: 'auto'}}>
            <I.search size={13}/>
            <input placeholder={lang === 'ko' ? '메시지 검색…' : 'Search…'}/>
          </div>
        </div>
        <div className="thread-list">
          {threads.map((th, i) => (
            <button key={th.id} className={`thread ${sel === i ? 'active' : ''}`} onClick={() => setSel(i)}>
              <div className="th-av">
                <span className="flag" style={{fontSize: 22}}>{th.flag}</span>
                <span className={`ch-badge ${ch(th.ch).cls}`}/>
              </div>
              <div className="th-body">
                <div className="th-top">
                  <span className="nm">{lang === 'ko' ? th.name : th.en}</span>
                  <span className="tm text-muted num">{th.time}</span>
                </div>
                <div className="th-mid">
                  <span className="mini-ch"><span className={`dot ${ch(th.ch).cls}`}/>{ch(th.ch).name}</span>
                </div>
                <div className="th-last">
                  <span className="snippet">{th.last}</span>
                  {th.unread > 0 && <span className="unread num">{th.unread}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="msg-conv">
        <div className="conv-head">
          <div className="ch-info">
            <span className="flag" style={{fontSize: 18}}>{cur.flag}</span>
            <div>
              <div className="ch-name">{lang === 'ko' ? cur.name : cur.en}</div>
              <div className="ch-sub mini-ch"><span className={`dot ${ch(cur.ch).cls}`}/>{ch(cur.ch).name} · BK-294{cur.id}</div>
            </div>
          </div>
          <div style={{display:'flex', gap: 6}}>
            <button className="btn sm ghost"><I.calCheck size={12}/> {lang === 'ko' ? '예약 보기' : 'View booking'}</button>
            <button className="btn sm ghost"><I.user size={12}/> {lang === 'ko' ? '게스트 정보' : 'Guest'}</button>
            <button className="btn ghost icon sm"><I.more size={12}/></button>
          </div>
        </div>

        <div className="conv-body">
          <div className="day-divider"><span>{lang === 'ko' ? '오늘' : 'Today'}</span></div>
          {msgs.map((m, i) => (
            <div key={i} className={`bubble ${m.from}`}>
              <div className="bub-text">{m.text}</div>
              <div className="bub-time text-muted">{m.time}</div>
            </div>
          ))}
        </div>

        <div className="conv-input">
          <div className="ai-suggest">
            <I.sparkle size={12}/>
            <span style={{fontSize: 12, color: 'var(--t-2)'}}>{lang === 'ko' ? 'AI 추천 답장:' : 'AI suggested reply:'}</span>
            <button className="ai-chip">{lang === 'ko' ? '✓ 12시 가능 (₩30,000)' : '✓ Yes at 12pm (+₩30K)'}</button>
            <button className="ai-chip">{lang === 'ko' ? '✕ 14시부터 가능' : '✕ Only after 14:00'}</button>
            <button className="ai-chip">{lang === 'ko' ? '짐 보관 안내' : 'Offer luggage storage'}</button>
          </div>
          <div className="input-row">
            <button className="btn ghost icon"><I.paperclip size={14}/></button>
            <textarea className="msg-input" placeholder={lang === 'ko' ? '답장 입력…' : 'Type a reply…'}/>
            <button className="btn primary"><I.send size={13}/> {lang === 'ko' ? '전송' : 'Send'}</button>
          </div>
        </div>
      </div>

      <div className="msg-context">
        <div className="ctx-h">
          <span className="tracker">{lang === 'ko' ? '예약 상세' : 'Booking detail'}</span>
        </div>
        <div className="ctx-card">
          <div className="ctx-row"><span>ID</span><span className="mono">BK-2942</span></div>
          <div className="ctx-row"><span>{lang === 'ko' ? '체크인' : 'Check-in'}</span><span className="num">1/13 15:00</span></div>
          <div className="ctx-row"><span>{lang === 'ko' ? '체크아웃' : 'Check-out'}</span><span className="num">1/16 11:00</span></div>
          <div className="ctx-row"><span>{lang === 'ko' ? '객실' : 'Room'}</span><span>1208 · {lang === 'ko' ? '디럭스 트윈' : 'Deluxe Twin'}</span></div>
          <div className="ctx-row"><span>{lang === 'ko' ? '게스트' : 'Guests'}</span><span>2 adults</span></div>
          <div className="ctx-row"><span>{lang === 'ko' ? '총액' : 'Total'}</span><span className="num">₩474,000</span></div>
        </div>
        <div className="ctx-h" style={{marginTop: 16}}>
          <span className="tracker">{lang === 'ko' ? '게스트' : 'Guest'}</span>
        </div>
        <div className="ctx-card">
          <div className="g-summary">
            <div className="bd-avatar" style={{width: 40, height: 40, fontSize: 16}}>김</div>
            <div>
              <div style={{fontWeight: 600}}>{lang === 'ko' ? '김도윤' : 'Kim Doyun'}</div>
              <div className="text-muted" style={{fontSize: 11}}>kim.doyun@gmail.com</div>
            </div>
          </div>
          <div style={{display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap'}}>
            <span className="pill warn">VIP</span>
            <span className="pill"><I.star size={10}/> 4.92</span>
            <span className="pill">{lang === 'ko' ? '재방문 3회' : '3 stays'}</span>
          </div>
        </div>
        <div className="ctx-h" style={{marginTop: 16}}>
          <span className="tracker">{lang === 'ko' ? '저장된 답변' : 'Saved replies'}</span>
        </div>
        <div className="ctx-card replies">
          <button className="ctx-reply">{lang === 'ko' ? '체크인 안내' : 'Check-in info'}</button>
          <button className="ctx-reply">{lang === 'ko' ? '주차 안내' : 'Parking info'}</button>
          <button className="ctx-reply">{lang === 'ko' ? '레이트 체크아웃' : 'Late check-out'}</button>
          <button className="ctx-reply">{lang === 'ko' ? '와이파이' : 'WiFi password'}</button>
        </div>
      </div>

      <style>{`
        .msg-wrap { display: grid; grid-template-columns: 320px 1fr 280px; height: 100%;}
        .msg-list { border-right: 1px solid var(--bd-1); display: flex; flex-direction: column; background: var(--bg-1);}
        .ml-head { padding: 8px 0; border-bottom: 1px solid var(--bd-1);}
        .ml-tabs { display: flex; gap: 2px; padding: 0 12px;}
        .ml-tabs .tab { border: 0; background: transparent; padding: 6px 10px; font: inherit; font-size: var(--fs-sm); color: var(--t-3); cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px;}
        .ml-tabs .tab.active { color: var(--t-1); font-weight: 500; background: var(--bg-elev);}
        .ml-tabs .tab .cnt { color: var(--t-3); font-size: 11px;}
        .search-bar { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 28px; background: var(--bg); border: 1px solid var(--bd-1); border-radius: var(--r-sm); color: var(--t-3);}
        .search-bar input { flex: 1; border: 0; background: transparent; outline: none; font: inherit; font-size: var(--fs-sm);}
        .thread-list { flex: 1; overflow: auto;}
        .thread { width: 100%; text-align: left; border: 0; background: transparent; padding: 12px; border-bottom: 1px solid var(--bd-1); cursor: pointer; font: inherit; display: flex; gap: 10px;}
        .thread:hover { background: var(--bg-hover);}
        .thread.active { background: var(--bg-elev); box-shadow: inset 3px 0 0 var(--acc);}
        .th-av { position: relative; flex: 0 0 36px;}
        .ch-badge { position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 4px; border: 2px solid var(--bg-1);}
        .thread.active .ch-badge { border-color: var(--bg-elev);}
        .th-body { flex: 1; min-width: 0;}
        .th-top { display: flex; justify-content: space-between; align-items: center;}
        .th-top .nm { font-weight: 600; font-size: var(--fs-md); color: var(--t-1);}
        .th-top .tm { font-size: 11px;}
        .th-mid { margin: 2px 0;}
        .th-last { display: flex; justify-content: space-between; align-items: center; gap: 8px;}
        .snippet { font-size: var(--fs-xs); color: var(--t-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
        .unread { background: var(--acc); color: white; padding: 0 6px; min-width: 16px; height: 16px; line-height: 16px; border-radius: 999px; font-size: 10px; font-weight: 600; text-align: center;}

        .msg-conv { display: flex; flex-direction: column; min-height: 0; background: var(--bg);}
        .conv-head { padding: 12px 20px; border-bottom: 1px solid var(--bd-1); display: flex; justify-content: space-between; align-items: center;}
        .ch-info { display: flex; gap: 10px; align-items: center;}
        .ch-name { font-weight: 600; color: var(--t-1);}
        .ch-sub { font-size: var(--fs-xs);}
        .conv-body { flex: 1; overflow: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 8px;}
        .day-divider { text-align: center; margin: 8px 0;}
        .day-divider span { font-size: 11px; color: var(--t-3); background: var(--bg-mute); padding: 2px 10px; border-radius: 999px;}
        .bubble { max-width: 60%; padding: 10px 12px; border-radius: 12px; font-size: var(--fs-md); line-height: 1.45; align-self: flex-start;}
        .bubble.them { background: var(--bg-mute); color: var(--t-1); border-bottom-left-radius: 4px;}
        .bubble.me { background: var(--acc); color: white; align-self: flex-end; border-bottom-right-radius: 4px;}
        .bub-time { font-size: 10px; margin-top: 4px; }
        .bubble.them .bub-time { color: var(--t-3);}
        .bubble.me .bub-time { color: rgba(255,255,255,0.8);}

        .conv-input { border-top: 1px solid var(--bd-1); padding: 10px 20px 14px;}
        .ai-suggest { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 8px; background: var(--acc-soft); border-radius: var(--r-sm); color: var(--acc-text); flex-wrap: wrap;}
        .ai-chip { border: 1px solid var(--acc-bd); background: var(--bg); color: var(--acc-text); font: inherit; font-size: var(--fs-xs); padding: 3px 8px; border-radius: 4px; cursor: pointer;}
        .ai-chip:hover { background: var(--acc); color: white;}
        .input-row { display: flex; gap: 6px; align-items: flex-end;}
        .msg-input { flex: 1; min-height: 40px; max-height: 120px; resize: none; border: 1px solid var(--bd-2); border-radius: var(--r-sm); padding: 10px 12px; font: inherit; font-size: var(--fs-md); outline: none; color: var(--t-1); background: var(--bg);}
        .msg-input:focus { border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc-soft);}

        .msg-context { border-left: 1px solid var(--bd-1); padding: 16px; background: var(--bg-1); overflow: auto;}
        .ctx-h { padding: 0 0 6px;}
        .ctx-card { background: var(--bg-elev); border: 1px solid var(--bd-1); border-radius: var(--r-md); padding: 12px;}
        .ctx-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: var(--fs-sm); color: var(--t-2);}
        .ctx-row > span:first-child { color: var(--t-3);}
        .ctx-row > span:last-child { color: var(--t-1); font-weight: 500;}
        .g-summary { display: flex; gap: 10px; align-items: center;}
        .replies { display: flex; flex-direction: column; gap: 4px; padding: 8px;}
        .ctx-reply { text-align: left; border: 0; background: var(--bg-mute); padding: 6px 10px; font: inherit; font-size: var(--fs-sm); cursor: pointer; border-radius: 4px; color: var(--t-2);}
        .ctx-reply:hover { background: var(--bg-hover); color: var(--t-1);}

        .bd-avatar { width: 40px; height: 40px; border-radius: 999px; background: linear-gradient(135deg, #fcd34d, #f59e0b); color: #78350f; font-weight: 700; font-size: 16px; display: flex; align-items: center; justify-content: center; flex: 0 0 40px;}
        .mini-ch { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--t-2); font-weight: 500;}
        .mini-ch .dot { width: 7px; height: 7px; border-radius: 2px; flex: 0 0 7px;}
      `}</style>
    </div>
  );
};
window.Messages = Messages;
