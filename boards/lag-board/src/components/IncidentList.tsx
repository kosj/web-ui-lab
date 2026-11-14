import { useRef } from 'react';
import { Activity, Ban, EyeOff, Layers, MessageSquareWarning, Play } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { isActiveAt } from '../analytics/model';
import type { Evidence, Incident } from '../analytics/incidents';
import type { RegionId } from '../data/config';
import { fmtCompact, fmtDuration, fmtInt, hhmm } from '../lib/format';
import { incidentTierAt } from '../lib/view';
import { CauseBadge, TierPill } from './Badges';
import type { BlindSpot } from '../analytics/signals';
import { CATEGORY_LABEL } from '../data/chat';

const EVIDENCE_META: Record<Evidence['kind'], { icon: typeof Layers; label: string }> = {
  scope: { icon: Layers, label: '범위' },
  signal: { icon: Activity, label: '신호' },
  exclude: { icon: Ban, label: '배제' },
  voice: { icon: MessageSquareWarning, label: '제보' },
};

export function IncidentList(props: {
  m: BoardModel; t: number; region: 'ALL' | RegionId; selectedId: string | null; onPick: (inc: Incident) => void;
  onReplay: (inc: Incident) => void;
  onBlind: (b: BlindSpot) => void;
}) {
  const { m, t, region, selectedId, onPick, onReplay, onBlind } = props;
  const blinds = m.blindSpots.filter((b) => b.onsetIdx <= t && (region === 'ALL' || b.region === region));
  const blindActive = (b: BlindSpot) => b.onsetIdx <= t && (b.endIdx === null || t < b.endIdx);
  // 처음 화면에 있던 카드는 그대로, 이후 새로 나타난 장애만 등장 모션 (재생 중 장애 발생 순간).
  // 처음 본 시각을 기억해 1초 동안 is-fresh를 유지 — 다음 재생 틱에 클래스가 빠져 애니메이션이 끊기지 않게.
  const seen = useRef<Map<string, number> | null>(null);
  const visible = m.incidents
    .filter((i) => i.onsetIdx <= t)
    .filter((i) => region === 'ALL' || i.region === region || i.cause === 'client');
  const active = visible.filter((i) => isActiveAt(i, t)).reverse();
  const past = visible.filter((i) => !isActiveAt(i, t)).reverse();
  if (seen.current === null) seen.current = new Map(visible.map((i) => [i.id, 0]));
  const now = performance.now();
  // 화면에서 사라진 장애는 잊는다 → 재생으로 다시 나타나면 다시 등장 모션
  const ids = new Set(visible.map((i) => i.id));
  for (const id of [...seen.current.keys()]) if (!ids.has(id)) seen.current.delete(id);
  for (const i of visible) if (!seen.current.has(i.id)) seen.current.set(i.id, now);
  const fresh = new Set(visible.filter((i) => now - (seen.current!.get(i.id) ?? 0) < 1000).map((i) => i.id));

  return (
    <section className="card incidents-card">
      <header className="card-head">
        <div>
          <h2>장애 판정</h2>
          <p className="card-sub">
            진행 <b className="num">{active.length + blinds.filter(blindActive).length}</b> · 해소 <b className="num">{past.length + blinds.filter((b) => !blindActive(b)).length}</b> · 지표 패턴과 유저 제보로 원인을 추정합니다
          </p>
        </div>
      </header>
      <ol className="incident-list">
        {blinds.filter(blindActive).map((b) => <li key={b.id}><BlindCard m={m} t={t} b={b} active onPick={onBlind} /></li>)}
        {[...active, ...past].map((inc) => (
          <li key={inc.id}>
            <IncidentCard m={m} t={t} inc={inc} active={isActiveAt(inc, t)} selected={selectedId === inc.id} fresh={fresh.has(inc.id)} onPick={onPick} onReplay={onReplay} />
          </li>
        ))}
        {blinds.filter((b) => !blindActive(b)).map((b) => <li key={b.id}><BlindCard m={m} t={t} b={b} active={false} onPick={onBlind} /></li>)}
        {visible.length === 0 && blinds.length === 0 && <li className="empty">이 기간·권역에서 감지된 장애가 없습니다.</li>}
      </ol>
    </section>
  );
}

function IncidentCard({ m, t, inc, active, selected, fresh, onPick, onReplay }: {
  m: BoardModel; t: number; inc: Incident; active: boolean; selected: boolean; fresh: boolean;
  onPick: (inc: Incident) => void; onReplay: (inc: Incident) => void;
}) {
  const end = inc.endIdx ?? t;
  const tier = incidentTierAt(m, inc, active ? t : inc.peakIdx);
  const conf = Math.round(inc.confidence * 100);
  return (
    <article className={`incident ${active ? 'is-active' : 'is-past'} ${selected ? 'is-selected' : ''} ${fresh ? 'is-fresh' : ''} tier-ring-${tier}`}>
      <button type="button" className="incident-hit" onClick={() => onPick(inc)} aria-label={`${inc.title} 상세 보기`} />
      <div className="incident-top">
        <CauseBadge cause={inc.cause} />
        <TierPill tier={tier} resolved={!active} />
        <span className="incident-id num">{inc.id}</span>
        <button type="button" className="incident-replay" onClick={() => onReplay(inc)} aria-label={`${inc.title} 재생`} title="시작 20분 전부터 재생">
          <Play size={11} strokeWidth={2.6} aria-hidden />
          재생
        </button>
      </div>
      <h3>{inc.title}</h3>
      <dl className="incident-facts">
        <div><dt>범위</dt><dd>{inc.scopeLabel} · 서버 {inc.serverIds.length}대</dd></div>
        <div>
          <dt>시간</dt>
          <dd className="num">
            {hhmm(m.ds.times[inc.onsetIdx])} 시작 · {active ? `${fmtDuration(t - inc.onsetIdx)}째` : `${fmtDuration(end - inc.onsetIdx)} 지속`}
          </dd>
        </div>
        <div><dt>감지</dt><dd className="num">{fmtDuration(inc.detectIdx - inc.onsetIdx)} 후 경보 (CUSUM)</dd></div>
        <div><dt>영향</dt><dd className="num">최대 {fmtCompact(inc.peakUsers)}명 · 피크 {fmtInt(inc.peakEl)}ms</dd></div>
      </dl>
      <div className="confidence">
        <span>판정 신뢰도</span>
        <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={conf} aria-label="판정 신뢰도">
          <span style={{ width: `${conf}%` }} />
        </span>
        <b className="num">{conf}%</b>
      </div>
      <ul className="evidence">
        {inc.evidence.map((e, i) => {
          const meta = EVIDENCE_META[e.kind];
          const Icon = meta.icon;
          return (
            <li key={i} className={`ev-${e.kind}`}>
              <span className="ev-kind"><Icon size={12} strokeWidth={2.2} aria-hidden />{meta.label}</span>
              <span>{e.text}</span>
            </li>
          );
        })}
      </ul>
      {inc.share < 0.8 && (
        <p className="incident-note">동시에 진행 중인 다른 장애가 같은 서버의 지연에 섞여 있어 신뢰도가 낮아졌습니다 (원인 점유율 {Math.round(inc.share * 100)}%).</p>
      )}
    </article>
  );
}

/** 측정 사각지대 — 유저 제보만 급증하고 지표(EL·재전송)는 평소인 구간 */
function BlindCard({ m, t, b, active, onPick }: { m: BoardModel; t: number; b: BlindSpot; active: boolean; onPick: (b: BlindSpot) => void }) {
  const end = b.endIdx ?? t;
  return (
    <article className={`incident blind ${active ? 'is-active' : 'is-past'}`}>
      <button type="button" className="incident-hit" onClick={() => onPick(b)} aria-label="측정 사각지대 상세 보기" />
      <div className="incident-top">
        <span className="blind-badge"><EyeOff size={12} aria-hidden />제보 기반</span>
        {active ? <span className="tier-pill">지표 정상</span> : <TierPill tier="smooth" resolved />}
        <span className="incident-id num">{b.id}</span>
      </div>
      <h3>측정 사각지대 — 지표에 안 보이는 렉</h3>
      <dl className="incident-facts">
        <div><dt>범위</dt><dd>{b.serverIds.join(', ')}</dd></div>
        <div><dt>시간</dt><dd className="num">{hhmm(m.ds.times[b.onsetIdx])} 시작 · {active ? `${fmtDuration(t - b.onsetIdx)}째` : `${fmtDuration(end - b.onsetIdx)} 지속`}</dd></div>
        <div><dt>제보</dt><dd className="num">평소의 {b.peakX.toFixed(1)}배 · {fmtInt(b.reports)}명</dd></div>
      </dl>
      <ul className="evidence">
        <li className="ev-voice"><span className="ev-kind"><MessageSquareWarning size={12} strokeWidth={2.2} aria-hidden />제보</span><span>주요 표현 ‘{CATEGORY_LABEL[b.topCategory]}’ {Math.round(b.topShare * 100)}%</span></li>
        <li className="ev-exclude"><span className="ev-kind"><Ban size={12} strokeWidth={2.2} aria-hidden />배제</span><span>체감 지연·TCP 재전송 모두 직전 15분부터 평소 수준</span></li>
      </ul>
      <p className="incident-note">측정하지 않는 구간(로딩, 특정 콘텐츠, 클라 로직)의 렉일 수 있습니다. 해당 서버의 로그와 클라 텔레메트리를 확인하세요.</p>
    </article>
  );
}
