import { ArrowUpRight, EyeOff, Play } from 'lucide-react';
import { isActiveAt, type BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import type { BlindSpot } from '../analytics/signals';
import { CAUSE_LABEL, REGIONS, TIER_LABEL, tierOf, type RegionId } from '../data/config';
import { CAUSE_ICON, TIER_ICON } from '../components/Badges';
import { fmtCompact, fmtDuration, fmtInt, hhmm } from '../lib/format';
import { TIER_RANK } from '../lib/view';

type Scope = 'ALL' | RegionId;
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name])) as Record<RegionId, string>;

/**
 * 장애 피드 — 그 시점까지 "감지된" 장애만 (재생하면 감지 순서대로 들어온다).
 * 진행 중: 원인색 띠 + 위쪽 스캔선(진행 중 경보) + 현재 등급. 해소: 접힌 한 줄 요약.
 * 측정 사각지대(제보만 급증)는 지표에 안 보이는 렉이라 별도 카드로 둔다.
 */
export function IncidentFeed({ m, t, scope, selectedId, onPick, onReplay, onAnalysis, onBlind }: {
  m: BoardModel; t: number; scope: Scope; selectedId: string | null;
  onPick: (inc: Incident) => void;
  onReplay: (inc: Incident) => void;
  onAnalysis: (id: string) => void;
  onBlind: (b: BlindSpot) => void;
}) {
  const inScope = (region?: RegionId, global = false) => scope === 'ALL' || global || region === scope;
  const seen = m.incidents.filter((i) => i.detectIdx <= t && inScope(i.region, i.scopeType === 'global'));
  const worstEl = (i: Incident) => Math.max(...i.serverIds.map((id) => m.an[id].el[t]));
  const active = seen.filter((i) => isActiveAt(i, t)).sort((a, b) => worstEl(b) - worstEl(a));
  const done = seen.filter((i) => !isActiveAt(i, t)).sort((a, b) => (b.endIdx ?? 0) - (a.endIdx ?? 0));
  const blinds = m.blindSpots.filter((b) => b.onsetIdx + 5 <= t && inScope(b.region));
  return (
    <section className="cc-panel cc-feed" aria-labelledby="cc-feed-title">
      <header className="cc-panel-head">
        <h2 id="cc-feed-title">장애 피드</h2>
        <span className="cc-feed-count"><b className={active.length ? 'is-hot' : ''}>{active.length}</b> 진행 · {done.length} 해소</span>
      </header>
      <ol className="cc-feed-list">
        {active.length === 0 && <li className="cc-feed-empty">진행 중인 장애 없음 — 모든 권역이 전일 동시간대 범위 안</li>}
        {active.map((inc) => {
          const el = worstEl(inc);
          const tier = tierOf(el);
          const Icon = CAUSE_ICON[inc.cause];
          const TIcon = TIER_ICON[tier];
          return (
            <li key={inc.id} className={`cc-inc is-active cc-c-${inc.cause} ${selectedId === inc.id ? 'is-selected' : ''} ${TIER_RANK[tier] >= TIER_RANK.warning ? 'is-severe' : ''}`}>
              <span className="cc-inc-scan" aria-hidden />
              <button type="button" className="cc-inc-main" onClick={() => onPick(inc)} aria-pressed={selectedId === inc.id}>
                <span className="cc-inc-top">
                  <span className={`cc-cause cc-c-${inc.cause}`}><Icon size={12} strokeWidth={2.4} aria-hidden />{CAUSE_LABEL[inc.cause]}</span>
                  <span className="cc-inc-scope">{inc.scopeLabel}</span>
                  <span className={`cc-tier-tag cc-t-${tier}`}><TIcon size={11} strokeWidth={2.6} aria-hidden />{TIER_LABEL[tier]}</span>
                </span>
                <span className="cc-inc-title">{inc.title}</span>
                <span className="cc-inc-meta num">
                  <span>{hhmm(m.ds.times[inc.onsetIdx])} 시작 · <b>{fmtDuration(t - inc.onsetIdx)}째</b></span>
                  <span>현재 <b>{fmtInt(el)}ms</b></span>
                  <span>최대 영향 {fmtCompact(inc.peakUsers)}명</span>
                </span>
                <span className="cc-conf" title="판정 신뢰도 = ½ 원인 점유율 + ½ 확산 패턴 일치도">
                  <span className="cc-conf-bar"><i style={{ width: `${Math.round(inc.confidence * 100)}%` }} /></span>
                  <span className="num">신뢰도 {Math.round(inc.confidence * 100)}%</span>
                </span>
              </button>
              <span className="cc-inc-actions">
                <button type="button" className="cc-btn" onClick={() => onReplay(inc)}><Play size={12} aria-hidden />재생</button>
                <button type="button" className="cc-btn ghost" onClick={() => onAnalysis(inc.id)}>분석 보드<ArrowUpRight size={12} aria-hidden /></button>
              </span>
            </li>
          );
        })}
        {blinds.map((b) => (
          <li key={b.id} className="cc-inc is-blind">
            <button type="button" className="cc-inc-main" onClick={() => onBlind(b)}>
              <span className="cc-inc-top">
                <span className="cc-cause cc-c-blind"><EyeOff size={12} strokeWidth={2.4} aria-hidden />측정 사각지대</span>
                <span className="cc-inc-scope">{REGION_NAME[b.region]} · 서버 {b.serverIds.length}대</span>
              </span>
              <span className="cc-inc-title">제보만 평소의 {b.peakX.toFixed(1)}배 — 지표에는 안 보이는 렉</span>
              <span className="cc-inc-meta num">
                <span>{hhmm(m.ds.times[b.onsetIdx])}–{b.endIdx === null ? '진행 중' : hhmm(m.ds.times[b.endIdx])}</span>
                <span>제보 {fmtInt(b.reports)}건</span>
              </span>
            </button>
          </li>
        ))}
        {done.map((inc) => {
          const Icon = CAUSE_ICON[inc.cause];
          return (
            <li key={inc.id} className={`cc-inc is-done cc-c-${inc.cause} ${selectedId === inc.id ? 'is-selected' : ''}`}>
              <button type="button" className="cc-inc-main" onClick={() => onPick(inc)} aria-pressed={selectedId === inc.id}>
                <span className="cc-inc-top">
                  <span className={`cc-cause cc-c-${inc.cause}`}><Icon size={12} strokeWidth={2.4} aria-hidden />{CAUSE_LABEL[inc.cause]}</span>
                  <span className="cc-inc-title">{inc.title}</span>
                </span>
                <span className="cc-inc-meta num">
                  <span>해소 · {hhmm(m.ds.times[inc.onsetIdx])}–{hhmm(m.ds.times[inc.endIdx!])} ({fmtDuration(inc.endIdx! - inc.onsetIdx)})</span>
                  <span>최고 {fmtInt(inc.peakEl)}ms</span>
                </span>
              </button>
              <span className="cc-inc-actions">
                <button type="button" className="cc-btn" onClick={() => onReplay(inc)} aria-label={`${inc.title} 재생`}><Play size={12} aria-hidden /></button>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
