import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { isActiveAt, type BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import type { BlindSpot } from '../analytics/signals';
import { CAUSE_LABEL, REGIONS, TIERS, type RegionId } from '../data/config';
import { CAUSE_ICON } from '../components/Badges';
import { useReplay } from '../lib/useReplay';
import type { Handoff, ViewId } from '../lib/route';
import { Hud } from './Hud';
import { LagGauge } from './LagGauge';
import { RailStats } from './RailStats';
import { CauseEqualizer } from './CauseEqualizer';
import { WorldFlowMap } from './WorldFlowMap';
import { IncidentFeed } from './IncidentFeed';
import { RegionPods } from './RegionPods';
import { TimelineRibbon } from './TimelineRibbon';
import { CC_VARS } from './palette';
import './command.css';

type Scope = 'ALL' | RegionId;
const REGION_NAME = Object.fromEntries(REGIONS.map((r) => [r.id, r.name])) as Record<RegionId, string>;

/**
 * 커맨드 센터 — 관제실 벽 화면용 "한눈" 뷰. 분석 보드와 같은 모델·재생 엔진을 쓰고 배치·표현만 다르다.
 *
 * 배치 원칙 (knowledge/command-center.md):
 *  - 주인공은 하나: 세계 흐름 지도. 나머지는 지도를 읽는 데 필요한 것만 (SpaceX Dragon: 지금 필요한 정보만 보인다).
 *  - 왼쪽 레일 = "얼마나 나쁜가"(게이지·수치·원인), 오른쪽 아래 = "무엇이 일어났나"(피드·권역), 맨 아래 = "언제"(24시간 리본).
 *  - 권역을 고르면(지도 노드·포드) 게이지·이퀄라이저·피드·리본이 모두 그 권역으로 좁혀진다.
 *  - 모든 움직임은 데이터가 만든다. 모션을 끄면 같은 인코딩의 정지 화면.
 */
export function CommandCenter({ m, motion, onMotion, onView }: {
  m: BoardModel; motion: 'full' | 'reduced'; onMotion: () => void; onView: (v: ViewId, h?: Handoff | null) => void;
}) {
  const onAnalysis = (h: Handoff | null) => onView('analysis', h);
  const [cursor, setCursor] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('ALL');
  const [selected, setSelected] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const t = cursor ?? m.last;

  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 2200);
    return () => clearTimeout(id);
  }, []);

  const replay = useReplay((idx) => setCursor(idx >= m.last ? null : idx), () => {}, m.last);
  const { stop: stopReplay } = replay;
  useEffect(() => {
    document.documentElement.setAttribute('data-replay', replay.playing ? 'on' : 'off');
    return () => document.documentElement.setAttribute('data-replay', 'off');
  }, [replay.playing]);

  const manualCursor = useCallback((idx: number | null) => { stopReplay(); setCursor(idx); }, [stopReplay]);
  const pick = useCallback((inc: Incident) => {
    stopReplay();
    setSelected(inc.id);
    setScope(inc.scopeType === 'global' ? 'ALL' : inc.region ?? 'ALL');
    setCursor(inc.endIdx === null ? null : inc.peakIdx);
  }, [stopReplay]);
  /** 재생은 지도에서 봐야 의미가 있다 — 지도가 화면 밖이면 끌어올린다 */
  const showHero = useCallback(() => {
    const hero = document.querySelector('.cc-hero');
    if (hero && hero.getBoundingClientRect().top < 0) hero.scrollIntoView({ behavior: motion === 'full' ? 'smooth' : 'auto', block: 'start' });
  }, [motion]);
  const replayIncident = useCallback((inc: Incident) => {
    showHero();
    setSelected(inc.id);
    setScope(inc.scopeType === 'global' ? 'ALL' : inc.region ?? 'ALL');
    const from = Math.max(m.viewFrom, inc.onsetIdx - 20);
    const to = Math.min(m.last, (inc.endIdx ?? m.last) + 15);
    replay.start({ from, to }, to - from > 120 ? 30 : 10);
  }, [m, replay, showHero]);
  const replayRecent = useCallback(() => {
    showHero();
    replay.start({ from: Math.max(m.viewFrom, m.last - 180), to: m.last }, 30);
  }, [m, replay, showHero]);
  const pickBlind = useCallback((b: BlindSpot) => {
    stopReplay();
    setSelected(b.id);
    setScope(b.region);
    setCursor(b.endIdx === null ? null : Math.min(m.last, b.onsetIdx + 15));
  }, [m, stopReplay]);

  const agg = scope === 'ALL' ? m.global : m.regions[scope];
  const scopeLabel = scope === 'ALL' ? '글로벌' : REGION_NAME[scope];
  const active = useMemo(
    () => m.incidents.filter((i) => isActiveAt(i, t) && i.detectIdx <= t && (scope === 'ALL' || i.region === scope || i.scopeType === 'global')),
    [m, t, scope],
  );
  const live = cursor === null && !replay.active;
  // 전역(클라 버전) 장애는 지도의 한 점이 아니라 모든 권역에 걸치므로 지도 머리에 띠로 둔다
  const globalInc = m.incidents.filter((i) => i.scopeType === 'global' && isActiveAt(i, t) && i.detectIdx <= t);

  return (
    <div className={`cc ${booting ? 'is-booting' : ''} ${replay.active ? 'is-replaying' : ''}`} style={CC_VARS}>
      <Hud
        ts={m.ds.times[t]} nowTs={m.ds.times[m.last]} live={live} replaying={replay.active} serverCount={m.ds.servers.length}
        motion={motion} onMotion={onMotion} onAnalysis={() => onAnalysis(scope === 'ALL' ? null : { region: scope })} onBroadcast={() => onView('broadcast')}
        onLive={() => manualCursor(null)}
      />
      <main className="cc-main">
        <section className="cc-hero">
          <aside className="cc-panel cc-rail" aria-label={`${scopeLabel} 상태 요약`}>
            <LagGauge value={agg.p95[t]} prev={agg.p95[Math.max(m.viewFrom, t - 60)]} scopeLabel={scopeLabel} />
            <RailStats m={m} t={t} agg={agg} active={active} />
            <CauseEqualizer agg={agg} t={t} from={m.viewFrom} scopeLabel={scopeLabel} />
          </aside>

          <section className="cc-panel cc-map" aria-labelledby="cc-map-title">
            <header className="cc-panel-head cc-map-head">
              <h2 id="cc-map-title">실시간 트래픽 흐름</h2>
              <p>통신사 → 권역 DC · 입자 속도 = RTT · 흩어짐 = 지터 · 사라짐 = 손실(×5 강조)</p>
              {globalInc.map((gI) => {
                const Icon = CAUSE_ICON[gI.cause];
                return (
                  <span key={gI.id} className={`cc-gchip cc-c-${gI.cause}`} role="status">
                    <Icon size={13} aria-hidden /><b>전역 · {CAUSE_LABEL[gI.cause]}</b>{gI.title}
                  </span>
                );
              })}
              {scope !== 'ALL' && (
                <button type="button" className="cc-btn cc-scope-chip" onClick={() => setScope('ALL')}>
                  {REGION_NAME[scope]}만 보는 중 <X size={12} aria-label="해제" />
                </button>
              )}
            </header>
            <WorldFlowMap m={m} t={t} scope={scope} onScope={setScope} />
            <footer className="cc-legend" aria-label="등급 범례 — 유저 체감 지연(ms)">
              {TIERS.map((tr) => (
                <span key={tr.id} className={`cc-legend-item cc-t-${tr.id}`}><i aria-hidden />{tr.label}<em>{tr.min === 0 ? '<100' : `${tr.min}+`}</em></span>
              ))}
              <span className="cc-legend-sep" aria-hidden />
              <span className="cc-legend-item ping"><i aria-hidden />진행 중 장애(원인색)</span>
            </footer>
          </section>
        </section>

        <section className="cc-deck">
          <IncidentFeed
            m={m} t={t} scope={scope} selectedId={selected}
            onPick={pick} onReplay={replayIncident} onBlind={pickBlind}
            onAnalysis={(id) => onAnalysis({ incidentId: id })}
          />
          <RegionPods m={m} t={t} scope={scope} onScope={setScope} />
        </section>

        <TimelineRibbon
          m={m} t={t} live={live} scope={scope}
          replay={{ ...replay, onPlay: replayRecent }}
          onCursor={manualCursor}
        />
        <p className="cc-foot">
          가상 데이터 · 체감 지연 = 네트워크(RTT p95 + 1.5×지터 + 50ms×손실%) + 서버(½틱) + 클라(½프레임). 등급 근거·원인 판별 방법은 분석 보드 하단 참고.
        </p>
      </main>
    </div>
  );
}
