import { Fragment } from 'react';
import { Ban, Hourglass, MessageSquare, MonitorSmartphone, Unplug, Zap } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { getSignals, type SignalScope } from '../analytics/signals';
import { CATEGORY_LABEL, REPORT_CATEGORIES, type ReportCategory } from '../data/chat';
import { KEYWORDS, sampleMessages } from '../data/chatSamples';
import { REGIONS } from '../data/config';
import { fmtCompact, hhmm } from '../lib/format';

const CAT_ICON: Record<ReportCategory | 'spam', typeof Zap> = {
  stall: Unplug, delay: Zap, frame: MonitorSmartphone, loading: Hourglass, generic: MessageSquare, spam: Ban,
};

/** 메시지 안 렉 표현을 <mark>로 강조 */
function highlight(text: string) {
  const re = new RegExp(`(${KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>));
}

/**
 * 렉 제보 채팅 — 최근 10분의 유형 비중과 메시지 표본.
 * 유형은 분류 결과(끊김·튕김 / 지연 / 프레임 / 로딩 / 단순 렉). 막대는 한 색 — 유형은 순서가 없는 범주라 색 대신 아이콘·이름으로 구분한다.
 */
export function ChatStream({ m, t, scope }: { m: BoardModel; t: number; scope: SignalScope }) {
  const s = getSignals(m, scope);
  const label = scope.region ? REGIONS.find((r) => r.id === scope.region)!.name : '전체';
  const from = Math.max(0, t - 9);
  let total = 0;
  let spam = 0;
  const cats = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c, 0])) as Record<ReportCategory, number>;
  for (let i = from; i <= t; i++) {
    total += s.reports[i];
    spam += s.spamDropped[i];
    for (const c of REPORT_CATEGORIES) cats[c] += s.cat[c][i];
  }
  const sumCats = REPORT_CATEGORIES.reduce((a, c) => a + cats[c], 0) || 1;
  const msgs = sampleMessages(m, s.ids, t, 10, 8);

  return (
    <section className="card chat-card">
      <header className="card-head">
        <div>
          <h2>렉 제보 채팅 · {label}</h2>
          <p className="card-sub">{hhmm(m.ds.times[from])}–{hhmm(m.ds.times[t])} · 유저 단위 집계 · 닉네임 가림</p>
        </div>
        <span className="chat-total"><b className="num">{fmtCompact(total)}</b>명 제보{spam > 0 && <span className="muted"> · 도배 {fmtCompact(spam)}명 제외</span>}</span>
      </header>
      <ul className="cat-bars" aria-label="제보 유형 비중">
        {REPORT_CATEGORIES.map((c) => {
          const Icon = CAT_ICON[c];
          const share = cats[c] / sumCats;
          return (
            <li key={c}>
              <span className="cat-name"><Icon size={13} aria-hidden />{CATEGORY_LABEL[c]}</span>
              <span className="cat-bar" aria-hidden><i style={{ transform: `scaleX(${share})` }} /></span>
              <span className="num muted">{Math.round(share * 100)}%</span>
            </li>
          );
        })}
      </ul>
      <ol className="chat-list" aria-label="최근 렉 제보 메시지">
        {msgs.length === 0 && <li className="empty-note">최근 10분 동안 렉 제보가 없습니다.</li>}
        {msgs.map((msg) => {
          const Icon = CAT_ICON[msg.category];
          return (
            <li key={msg.key} className={`chat-msg ${msg.category === 'spam' ? 'is-spam' : ''}`}>
              <span className="chat-meta num">{hhmm(m.ds.times[msg.t])}<span className="chat-server">{msg.serverId}</span></span>
              <span className="chat-body">
                <span className="chat-nick">{msg.nick}</span>
                <span className="chat-text">{highlight(msg.text)}</span>
              </span>
              <span className="chat-cat" title={msg.category === 'spam' ? '같은 문구 도배 — 집계 제외' : CATEGORY_LABEL[msg.category]}>
                <Icon size={12} aria-hidden />
                <span className="sr-only">{msg.category === 'spam' ? '도배' : CATEGORY_LABEL[msg.category]}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
