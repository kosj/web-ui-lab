import { Activity, Ban, Layers } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { isActiveAt } from '../analytics/model';
import type { Evidence, Incident } from '../analytics/incidents';
import type { RegionId } from '../data/config';
import { fmtCompact, fmtDuration, fmtInt, hhmm } from '../lib/format';
import { incidentTierAt } from '../lib/view';
import { CauseBadge, TierPill } from './Badges';

const EVIDENCE_META: Record<Evidence['kind'], { icon: typeof Layers; label: string }> = {
  scope: { icon: Layers, label: '범위' },
  signal: { icon: Activity, label: '신호' },
  exclude: { icon: Ban, label: '배제' },
};

export function IncidentList(props: {
  m: BoardModel; t: number; region: 'ALL' | RegionId; selectedId: string | null; onPick: (inc: Incident) => void;
}) {
  const { m, t, region, selectedId, onPick } = props;
  const visible = m.incidents
    .filter((i) => i.onsetIdx <= t)
    .filter((i) => region === 'ALL' || i.region === region || i.cause === 'client');
  const active = visible.filter((i) => isActiveAt(i, t)).reverse();
  const past = visible.filter((i) => !isActiveAt(i, t)).reverse();

  return (
    <section className="card incidents-card">
      <header className="card-head">
        <div>
          <h2>장애 판정</h2>
          <p className="card-sub">
            진행 <b className="num">{active.length}</b> · 해소 <b className="num">{past.length}</b> · 지표 패턴으로 원인을 추정합니다
          </p>
        </div>
      </header>
      <ol className="incident-list">
        {[...active, ...past].map((inc) => (
          <li key={inc.id}>
            <IncidentCard m={m} t={t} inc={inc} active={isActiveAt(inc, t)} selected={selectedId === inc.id} onPick={onPick} />
          </li>
        ))}
        {visible.length === 0 && <li className="empty">이 기간·권역에서 감지된 장애가 없습니다.</li>}
      </ol>
    </section>
  );
}

function IncidentCard({ m, t, inc, active, selected, onPick }: {
  m: BoardModel; t: number; inc: Incident; active: boolean; selected: boolean; onPick: (inc: Incident) => void;
}) {
  const end = inc.endIdx ?? t;
  const tier = incidentTierAt(m, inc, active ? t : inc.peakIdx);
  const conf = Math.round(inc.confidence * 100);
  return (
    <article className={`incident ${active ? 'is-active' : 'is-past'} ${selected ? 'is-selected' : ''}`}>
      <button type="button" className="incident-hit" onClick={() => onPick(inc)} aria-label={`${inc.title} 상세 보기`} />
      <div className="incident-top">
        <CauseBadge cause={inc.cause} />
        <TierPill tier={tier} resolved={!active} />
        <span className="incident-id num">{inc.id}</span>
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
