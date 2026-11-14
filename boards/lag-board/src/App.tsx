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

type Scope = 'ALL' | RegionId;

export function App() {
  const [model, setModel] = useState<BoardModel | null>(null);
  useEffect(() => {
    // 첫 페인트(로딩 상태) 후 모델 계산
    const id = setTimeout(() => setModel(buildModel()), 30);
    return () => clearTimeout(id);
  }, []);
  const { mode, toggle } = useTheme();
  if (!model) return <Loading />;
  return <Board m={model} theme={mode} onTheme={toggle} />;
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

function Board({ m, theme, onTheme }: { m: BoardModel; theme: 'dark' | 'light'; onTheme: () => void }) {
  const tokens = useTokens(theme);
  const [range, setRange] = useState<RangeKey>('24h');
  const [cursor, setCursor] = useState<number | null>(null);
  const [scope, setScope] = useState<Scope>('ALL');
  const [server, setServer] = useState<string>(() => worstServer(m, m.last));
  const [selectedInc, setSelectedInc] = useState<string | null>(null);
  const t = cursor ?? m.last;

  const changeRange = useCallback((r: RangeKey) => {
    setRange(r);
    setCursor((c) => (c !== null && c < rangeIdx(m, r).from ? null : c));
  }, [m]);

  const pickIncident = useCallback((inc: Incident) => {
    setSelectedInc(inc.id);
    setScope(inc.cause === 'client' ? 'ALL' : inc.region ?? 'ALL');
    const ongoing = inc.endIdx === null;
    const at = ongoing ? m.last : inc.peakIdx;
    setCursor(ongoing ? null : inc.peakIdx);
    if (!ongoing && inc.peakIdx < rangeIdx(m, range).from) setRange('24h');
    const worst = [...inc.serverIds].sort((a, b) => m.an[b].el[at] - m.an[a].el[at])[0];
    setServer(worst);
  }, [m, range]);

  const onCell = useCallback((idx: number, region: Scope) => {
    setCursor(idx >= m.last ? null : idx);
    setScope(region);
    if (region !== 'ALL') {
      const ids = m.ds.servers.filter((s) => s.region === region).map((s) => s.id);
      setServer(ids.sort((a, b) => m.an[b].el[idx] - m.an[a].el[idx])[0]);
    }
  }, [m]);

  const onCursor = useCallback((idx: number) => setCursor(idx >= m.last ? null : idx), [m]);
  const live = useCallback(() => setCursor(null), []);
  const nowTs = m.ds.times[m.last];
  const cursorTs = cursor === null ? null : m.ds.times[cursor];

  const scopeChips = useMemo(() => [
    { key: 'ALL' as Scope, label: '전체', v: m.global.p95[t] },
    ...REGIONS.map((r) => ({ key: r.id as Scope, label: r.name, v: m.regions[r.id].p95[t] })),
  ], [m, t]);
  const sel = serverNow(m, server, t);

  return (
    <div className="app">
      <TopBar nowTs={nowTs} cursorTs={cursorTs} range={range} onRange={changeRange} onLive={live} theme={theme} onTheme={onTheme} serverCount={m.ds.servers.length} />
      <main className="board">
        <SummaryBanner m={m} t={t} onPick={pickIncident} />
        <KpiStrip m={m} t={t} range={range} />

        <nav className="filters" aria-label="권역 필터">
          <span className="eyebrow">권역</span>
          <div className="chips">
            {scopeChips.map((c) => {
              const tier = tierOf(c.v);
              return (
                <button key={c.key} type="button" className="chip" aria-pressed={scope === c.key} onClick={() => setScope(c.key)}>
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
          <IncidentList m={m} t={t} region={scope} selectedId={selectedInc} onPick={pickIncident} />
        </div>

        <ServerGrid m={m} t={t} range={range} region={scope} selected={server} onSelect={setServer} />
        <ServerDetail m={m} t={t} range={range} tokens={tokens} serverId={server} />
        <MethodNote />
      </main>
    </div>
  );
}
