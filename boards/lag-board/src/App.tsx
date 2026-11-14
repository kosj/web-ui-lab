import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildModel, type BoardModel } from './analytics/model';
import type { Incident } from './analytics/incidents';
import { REGIONS, tierOf, TIER_LABEL, type RegionId } from './data/config';
import { useTheme, useTokens } from './lib/theme';
import { rangeIdx, serverNow, type RangeKey } from './lib/view';
import { fmtInt } from './lib/format';
import { TopBar } from './components/TopBar';
import { SummaryBanner } from './components/SummaryBanner';
import { KpiStrip } from './components/KpiStrip';
import { RegionHeatmap } from './components/RegionHeatmap';
import { CauseBreakdown } from './components/CauseBreakdown';
import { IncidentList } from './components/IncidentList';
import { ServerGrid } from './components/ServerGrid';
import { ServerDetail } from './components/ServerDetail';
import { MethodNote } from './components/MethodNote';
import { DistributionHeatmap } from './components/DistributionHeatmap';
import { IspDrilldown } from './components/IspDrilldown';
import { MotionContext, useMotionPref, withViewTransition } from './lib/motion';
import { applyRootAttrs, effectiveTheme, STYLE_BY_ID, useStylePref, type StyleId } from './lib/style';
import { useReplay } from './lib/useReplay';
import { SignalChain } from './components/SignalChain';
import { CouplingCard } from './components/CouplingCard';
import { IncidentMap } from './components/IncidentMap';
import { DoseResponse } from './components/DoseResponse';
import { ChatStream } from './components/ChatStream';
import type { BlindSpot, SignalScope } from './analytics/signals';
import { applyViewAttr, useViewRoute, type Handoff, type ViewId } from './lib/route';
import { CommandCenter } from './command/CommandCenter';

type Scope = 'ALL' | RegionId;

export function App() {
  const [model, setModel] = useState<BoardModel | null>(null);
  useEffect(() => {
    // 첫 페인트(로딩 상태) 후 모델 계산
    const id = setTimeout(() => setModel(buildModel()), 30);
    return () => clearTimeout(id);
  }, []);
  const { mode, toggle } = useTheme();
  const motion = useMotionPref();
  const { style, setStyle } = useStylePref();
  const { view, setView } = useViewRoute();
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  // 커맨드 센터는 다크 전용 (관제실 벽 화면 · 발광 표현)
  const theme = view === 'command' ? 'dark' : effectiveTheme(style, mode);
  // 자식 차트가 토큰을 읽기 전에 <html> 속성이 맞아 있어야 한다 (멱등)
  applyRootAttrs(style, theme);
  applyViewAttr(view);
  const go = useCallback((v: ViewId, h: Handoff | null = null) => {
    withViewTransition(() => { setHandoff(h); setView(v); }, motion.mode === 'full');
  }, [motion.mode, setView]);
  if (!model) return <Loading />;
  return (
    <MotionContext.Provider value={motion.mode}>
      {view === 'command' ? (
        <CommandCenter m={model} motion={motion.mode} onMotion={motion.toggle} onAnalysis={(h) => go('analysis', h)} />
      ) : (
        <Board
          m={model} theme={theme} onTheme={toggle} motion={motion.mode} onMotion={motion.toggle}
          style={style} onStyle={setStyle} themeLocked={STYLE_BY_ID[style].themes.length === 1}
          onCommand={() => go('command')} handoff={handoff}
        />
      )}
    </MotionContext.Provider>
  );
}

function Loading() {
  return (
    <div className="loading" role="status">
      <span className="loading-bars" aria-hidden><i /><i /><i /><i /></span>
      <p>36개 서버의 49시간 지표를 분석하는 중…</p>
    </div>
  );
}

function worstServer(m: BoardModel, t: number) {
  return m.ds.servers.map((s) => ({ id: s.id, el: m.an[s.id].el[t] })).sort((a, b) => b.el - a.el)[0].id;
}

function Board({ m, theme, onTheme, motion, onMotion, style, onStyle, themeLocked, onCommand, handoff }: {
  m: BoardModel; theme: 'dark' | 'light'; onTheme: () => void; motion: 'full' | 'reduced'; onMotion: () => void;
  style: StyleId; onStyle: (s: StyleId) => void; themeLocked: boolean;
  onCommand: () => void; handoff: Handoff | null;
}) {
  const tokens = useTokens(`${theme}|${style}`);
  const [range, setRange] = useState<RangeKey>('24h');
  const [cursor, setCursor] = useState<number | null>(null);
  const [scope, setScopeRaw] = useState<Scope>('ALL');
  const [isp, setIsp] = useState<string | null>(null);
  // 권역이 바뀌면 통신사 선택은 의미가 없어지므로 해제
  const setScope = useCallback((s: Scope) => { setScopeRaw(s); setIsp(null); }, []);
  const [server, setServer] = useState<string>(() => worstServer(m, m.last));
  const [selectedInc, setSelectedInc] = useState<string | null>(null);
  const t = cursor ?? m.last;

  // 장애 재생 — 커서를 자동으로 앞으로 보낸다. 끝까지 가면 LIVE로 돌아가거나(현재까지 재생) 끝 시점에 멈춘다
  const replay = useReplay(
    (idx) => setCursor(idx >= m.last ? null : idx),
    () => {},
    m.last,
  );
  const { stop: stopReplay } = replay;
  useEffect(() => {
    const on = replay.playing ? 'on' : 'off';
    document.documentElement.setAttribute('data-replay', on);
    return () => document.documentElement.setAttribute('data-replay', 'off');
  }, [replay.playing]);
  /** 사용자가 직접 시점을 고르면 재생은 끝낸다 */
  const manual = useCallback((fn: () => void) => { stopReplay(); fn(); }, [stopReplay]);
  const vt = useCallback((fn: () => void) => withViewTransition(fn, motion === 'full' && !replay.playing), [motion, replay.playing]);

  const changeRange = useCallback((r: RangeKey) => {
    stopReplay();
    setRange(r);
    setCursor((c) => (c !== null && c < rangeIdx(m, r).from ? null : c));
  }, [m, stopReplay]);

  const selectIncident = useCallback((inc: Incident, at: number) => {
    setSelectedInc(inc.id);
    setScope(inc.cause === 'client' ? 'ALL' : inc.region ?? 'ALL');
    if (inc.scopeType === 'isp' && inc.isps?.[0]) setIsp(inc.isps[0].id);
    const worst = [...inc.serverIds].sort((a, b) => m.an[b].el[at] - m.an[a].el[at])[0];
    setServer(worst);
  }, [m, setScope]);

  const replayIncident = useCallback((inc: Incident) => {
    const from = Math.max(m.viewFrom, inc.onsetIdx - 20);
    const to = Math.min(m.last, (inc.endIdx ?? m.last) + 15);
    selectIncident(inc, inc.peakIdx);
    if (from < rangeIdx(m, range).from) setRange('24h');
    replay.start({ from, to }, 10);
  }, [m, range, replay, selectIncident]);

  const replayRange = useCallback(() => {
    const { from } = rangeIdx(m, range);
    const start = cursor !== null && cursor < m.last - 10 ? cursor : from;
    replay.start({ from: start, to: m.last });
  }, [m, range, cursor, replay]);

  const pickIncident = useCallback((inc: Incident) => {
    stopReplay();
    setSelectedInc(inc.id);
    setScope(inc.cause === 'client' ? 'ALL' : inc.region ?? 'ALL');
    if (inc.scopeType === 'isp' && inc.isps?.[0]) setIsp(inc.isps[0].id);
    const ongoing = inc.endIdx === null;
    const at = ongoing ? m.last : inc.peakIdx;
    setCursor(ongoing ? null : inc.peakIdx);
    if (!ongoing && inc.peakIdx < rangeIdx(m, range).from) setRange('24h');
    const worst = [...inc.serverIds].sort((a, b) => m.an[b].el[at] - m.an[a].el[at])[0];
    setServer(worst);
  }, [m, range, setScope, stopReplay]);

  const onCell = useCallback((idx: number, region: Scope) => {
    stopReplay();
    setCursor(idx >= m.last ? null : idx);
    setScope(region);
    if (region !== 'ALL') {
      const ids = m.ds.servers.filter((s) => s.region === region).map((s) => s.id);
      setServer(ids.sort((a, b) => m.an[b].el[idx] - m.an[a].el[idx])[0]);
    }
  }, [m, setScope, stopReplay]);

  const onIsp = useCallback((region: RegionId, id: string | null) => {
    vt(() => {
      setScopeRaw(region);
      setIsp(id);
    });
  }, [vt]);

  const onCursor = useCallback((idx: number) => manual(() => setCursor(idx >= m.last ? null : idx)), [m, manual]);
  const onBlind = useCallback((b: BlindSpot) => manual(() => {
    setSelectedInc(b.id);
    setScope(b.region);
    setServer(b.serverIds[0]);
    const mid = Math.min(m.last, b.onsetIdx + 15);
    if (mid < rangeIdx(m, range).from) setRange('24h');
    setCursor(b.endIdx === null ? null : mid);
  }), [m, manual, range, setScope]);
  const live = useCallback(() => manual(() => setCursor(null)), [manual]);
  // 커맨드 센터에서 넘어온 초점 — 첫 마운트에 한 번만 적용
  useEffect(() => {
    if (!handoff) return;
    const inc = handoff.incidentId ? m.incidents.find((i) => i.id === handoff.incidentId) : undefined;
    if (inc) pickIncident(inc);
    else if (handoff.incidentId) {
      const b = m.blindSpots.find((x) => x.id === handoff.incidentId);
      if (b) onBlind(b);
    } else if (handoff.region) setScope(handoff.region);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const selectServer = useCallback((id: string) => vt(() => setServer(id)), [vt]);
  const chooseScope = useCallback((s: Scope) => vt(() => setScope(s)), [vt, setScope]);
  const nowTs = m.ds.times[m.last];
  const cursorTs = cursor === null ? null : m.ds.times[cursor];

  const scopeChips = useMemo(() => [
    { key: 'ALL' as Scope, label: '전체', v: m.global.p95[t] },
    ...REGIONS.map((r) => ({ key: r.id as Scope, label: r.name, v: m.regions[r.id].p95[t] })),
  ], [m, t]);
  const sel = serverNow(m, server, t);
  const signalScope = useMemo<SignalScope>(() => (scope === 'ALL' ? {} : { region: scope }), [scope]);

  return (
    <div className="app">
      <TopBar
        nowTs={nowTs} cursorTs={cursorTs} range={range} onRange={changeRange} onLive={live}
        theme={theme} onTheme={onTheme} serverCount={m.ds.servers.length}
        motion={motion} onMotion={onMotion}
        style={style} onStyle={(s) => withViewTransition(() => onStyle(s), motion === 'full')} themeLocked={themeLocked}
        onCommand={onCommand}
        replay={{
          ...replay,
          progress: replay.win && replay.pos !== null ? (replay.pos - replay.win.from) / Math.max(1, replay.win.to - replay.win.from) : 0,
          posTs: replay.pos !== null ? m.ds.times[replay.pos] : null,
          onPlay: replayRange,
        }}
      />
      <main className="board">
        <SummaryBanner m={m} t={t} onPick={pickIncident} />
        <KpiStrip m={m} t={t} range={range} />

        <nav className="filters" aria-label="권역 필터">
          <span className="eyebrow">권역</span>
          <div className="chips">
            {scopeChips.map((c) => {
              const tier = tierOf(c.v);
              return (
                <button key={c.key} type="button" className="chip" aria-pressed={scope === c.key} onClick={() => chooseScope(c.key)}>
                  <span className={`dot dot-${tier}`} aria-hidden />
                  {c.label}
                  <span className="num muted">{fmtInt(c.v)}</span>
                  <span className="sr-only">{TIER_LABEL[tier]}</span>
                </button>
              );
            })}
          </div>
          <span className="filters-note muted">선택: <b>{server}</b> · {fmtInt(sel.el)}ms</span>
        </nav>

        <div className="row-main">
          <div className="col-charts">
            <RegionHeatmap m={m} t={t} range={range} tokens={tokens} region={scope} onCell={onCell} onIncident={pickIncident} />
            <CauseBreakdown m={m} t={t} range={range} tokens={tokens} scope={scope} onCursor={onCursor} />
          </div>
          <IncidentList m={m} t={t} region={scope} selectedId={selectedInc} onPick={pickIncident} onReplay={replayIncident} onBlind={onBlind} />
        </div>

        <section className="voice-section" aria-labelledby="voice-title">
          <div className="section-head">
            <h2 id="voice-title">유저 체감 신호</h2>
            <p>채팅 렉 제보가 TCP 재전송·체감 지연과 함께 움직이는지 봅니다. 모든 비교는 전일 동시간대 대비 편차로 합니다 — 원값끼리는 저녁 피크 때문에 허위 상관이 생깁니다.</p>
          </div>
          <div className="row-voice">
            <SignalChain m={m} t={t} range={range} tokens={tokens} scope={signalScope} onCursor={onCursor} />
            <CouplingCard m={m} range={range} tokens={tokens} scope={signalScope} />
          </div>
          <div className="row-voice-2">
            <IncidentMap m={m} t={t} tokens={tokens} onPick={pickIncident} />
            <DoseResponse m={m} range={range} tokens={tokens} scope={signalScope} />
            <ChatStream m={m} t={t} scope={signalScope} />
          </div>
        </section>

        <div className="row-split">
          <IspDrilldown m={m} t={t} range={range} tokens={tokens} scope={scope} isp={isp} onIsp={onIsp} />
          <DistributionHeatmap m={m} t={t} range={range} tokens={tokens} scope={scope} isp={isp} onCursor={onCursor} onClearIsp={() => setIsp(null)} />
        </div>

        <ServerGrid m={m} t={t} range={range} region={scope} selected={server} onSelect={selectServer} />
        <ServerDetail m={m} t={t} range={range} tokens={tokens} serverId={server} />
        <MethodNote />
      </main>
    </div>
  );
}
