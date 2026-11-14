import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardModel } from '../analytics/model';
import type { Incident } from '../analytics/incidents';
import type { RegionId } from '../data/config';
import { useReplay, type ReplaySpeed } from '../lib/useReplay';
import type { Handoff, ViewId } from '../lib/route';
import { BcTop } from './BcTop';
import { ScoreBug } from './ScoreBug';
import { TimingTower } from './TimingTower';
import { OnAir } from './OnAir';
import { RaceControl } from './RaceControl';
import { LowerThird } from './LowerThird';
import { SessionBar } from './SessionBar';
import { highlights, raceMessages, rankServers, stabilizeRanks, type RaceMsg } from './race';
import { BC_VARS } from './palette';
import './broadcast.css';

/** 로워서드 노출 시간 — 방송 자막 관례 3~6초 중 긴 쪽 (한 줄 제목 + 한 줄 설명을 두 번 읽을 시간) */
const L3_MS = 6000;
/** 이보다 오래된 경보는 자막으로 띄우지 않는다 (분) */
const L3_RECENT = 30;

/**
 * 라이브 중계 — 레이스·e스포츠 중계 그래픽 문법으로 만든 렉 관제 화면.
 *
 * 레퍼런스(knowledge/broadcast.md): F1 중계(타이밍 타워 · 레이스 컨트롤 · 텔레메트리), Riot Worlds·Tendril의
 * 모듈형 모션 시스템, Fox IndyCar/NASCAR(2025–26)의 "원시 숫자를 쏟지 않는 편집형 데이터", 방송 자막 3~6초 관례.
 *
 * 커맨드 센터와 다른 점: 움직임의 주제가 "흐름"이 아니라 "순위와 사건"이다.
 *   - 순위가 바뀌면 타워 줄이 자리를 옮기고(FLIP), 새 장애는 자막으로 들어오며, 카메라(ON AIR)가 그 서버로 넘어간다.
 *   - 정상은 회색, 색은 일이 났을 때만 (레이스 깃발).
 */
export function Broadcast({ m, motion, onMotion, onView }: {
  m: BoardModel; motion: 'full' | 'reduced'; onMotion: () => void; onView: (v: ViewId, h?: Handoff | null) => void;
}) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [region, setRegion] = useState<RegionId | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hl, setHl] = useState<number | null>(null);
  const [l3, setL3] = useState<{ msg: RaceMsg; leaving: boolean } | null>(null);
  const [booting, setBooting] = useState(true);
  const t = cursor ?? m.last;

  const msgs = useMemo(() => raceMessages(m), [m]);
  const hls = useMemo(() => highlights(m), [m]);
  // 순위는 이전 화면의 순서에서 출발해 히스테리시스로 안정화한다 (재생 중 타워가 출렁이지 않게)
  const prevRank = useRef(new Map<string, number>());
  const rows = useMemo(() => stabilizeRanks(rankServers(m, t, region), prevRank.current), [m, t, region]);
  useEffect(() => { prevRank.current = new Map(rows.map((r) => [r.id, r.rank])); }, [rows]);

  useEffect(() => {
    const id = setTimeout(() => setBooting(false), 1800);
    return () => clearTimeout(id);
  }, []);

  // ── 재생 · 하이라이트: 'all'이면 끝날 때 다음 장애로 이어 가고, 'single'이면 거기서 멈춘다
  const mode = useRef<'all' | 'single' | null>(null);
  const hlRef = useRef<number | null>(null);
  hlRef.current = hl;
  const nextTimer = useRef(0);
  const replayRef = useRef<ReturnType<typeof useReplay> | null>(null);
  const playOne = useCallback((i: number) => {
    const h = hls[i];
    if (!h || !replayRef.current) return;
    setHl(i);
    setPinned(null);
    setRegion(null);
    const len = h.to - h.from;
    replayRef.current.start({ from: h.from, to: h.to }, (len < 80 ? 10 : 30) as ReplaySpeed);
  }, [hls]);
  const replay = useReplay(
    (idx) => setCursor(idx >= m.last ? null : idx),
    () => {
      const i = hlRef.current;
      if (mode.current === 'all' && i !== null && i + 1 < hls.length) {
        nextTimer.current = window.setTimeout(() => playOne(i + 1), 900);
      } else {
        mode.current = null;
        setHl(null);
      }
    },
    m.last,
  );
  replayRef.current = replay;
  const playAll = useCallback(() => { clearTimeout(nextTimer.current); mode.current = 'all'; playOne(0); }, [playOne]);
  const playSingle = useCallback((i: number) => { clearTimeout(nextTimer.current); mode.current = 'single'; playOne(i); }, [playOne]);
  const stopAll = useCallback(() => {
    clearTimeout(nextTimer.current);
    mode.current = null;
    setHl(null);
    replay.stop();
  }, [replay]);
  useEffect(() => () => clearTimeout(nextTimer.current), []);
  useEffect(() => {
    document.documentElement.setAttribute('data-replay', replay.playing ? 'on' : 'off');
    return () => document.documentElement.setAttribute('data-replay', 'off');
  }, [replay.playing]);

  const manualCursor = useCallback((idx: number | null) => {
    stopAll();
    setCursor(idx);
  }, [stopAll]);

  // ── 로워서드: 그 시점의 가장 최근 경보(감지·격상)가 바뀌면 6초간
  const latestAlert = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const x = msgs[i];
      if (x.idx > t || (x.kind !== 'detect' && x.kind !== 'escalate')) continue;
      if (region && x.region && x.region !== region) continue;
      return t - x.idx <= L3_RECENT ? x : null;
    }
    return null;
  }, [msgs, t, region]);
  const shownAlert = useRef<string | null>(null);
  const showL3 = useCallback((msg: RaceMsg) => {
    setL3({ msg, leaving: false });
  }, []);
  useEffect(() => {
    if (!latestAlert || shownAlert.current === latestAlert.id) return;
    shownAlert.current = latestAlert.id;
    showL3(latestAlert);
  }, [latestAlert, showL3]);
  useEffect(() => {
    if (!l3 || l3.leaving) return;
    const a = setTimeout(() => setL3((x) => (x ? { ...x, leaving: true } : x)), L3_MS - 320);
    return () => clearTimeout(a);
  }, [l3]);
  useEffect(() => {
    if (!l3?.leaving) return;
    const b = setTimeout(() => setL3(null), 320);
    return () => clearTimeout(b);
  }, [l3]);

  // ── ON AIR 자동 연출: 하이라이트 중이면 그 장애, 자막이 떠 있으면 그 장애, 아니면 타워 1위
  const worstOf = useCallback((inc: Incident) => {
    const ids = inc.serverIds.filter((id) => !region || m.ds.servers.find((s) => s.id === id)?.region === region);
    const pool = ids.length ? ids : inc.serverIds;
    return [...pool].sort((a, b) => m.an[b].el[t] - m.an[a].el[t])[0];
  }, [m, t, region]);
  const autoId = useMemo(() => {
    if (hl !== null && hls[hl]) return worstOf(hls[hl].inc);
    const incId = l3?.msg.incidentId;
    const inc = incId ? m.incidents.find((i) => i.id === incId) : undefined;
    if (inc) return worstOf(inc);
    return rows[0]?.id ?? m.ds.servers[0].id;
  }, [hl, hls, l3, m, rows, worstOf]);
  const onAir = pinned ?? autoId;

  const pickRegion = useCallback((r: RegionId | null) => { setRegion(r); setPinned(null); }, []);
  const pickRow = useCallback((id: string) => setPinned((p) => (p === id ? null : id)), []);
  const pickMsg = useCallback((x: RaceMsg) => {
    manualCursor(x.idx >= m.last ? null : x.idx);
    setPinned(null);
    if (x.kind === 'detect' || x.kind === 'escalate') { shownAlert.current = x.id; showL3(x); }
  }, [m, manualCursor, showL3]);

  const live = cursor === null && !replay.active;
  return (
    <div className={`bc ${booting ? 'is-booting' : ''}`} style={BC_VARS}>
      <BcTop
        ts={m.ds.times[t]} nowTs={m.ds.times[m.last]} live={live} replaying={replay.active}
        highlight={hl !== null ? `H${hl + 1}` : null}
        motion={motion} onMotion={onMotion} onView={(v) => onView(v)} onLive={() => manualCursor(null)}
      />
      <main className="bc-main">
        <ScoreBug m={m} t={t} region={region} onRegion={pickRegion} />
        <div className="bc-grid">
          <TimingTower rows={rows} region={region} onAir={onAir} pinned={pinned !== null} onPick={pickRow} />
          <OnAir
            m={m} t={t} id={onAir} auto={pinned === null} onAuto={() => setPinned(pinned === null ? onAir : null)}
            overlay={l3 && <LowerThird m={m} msg={l3.msg} leaving={l3.leaving} />}
          />
          <RaceControl m={m} msgs={msgs} t={t} onPick={pickMsg} />
        </div>
        <SessionBar
          m={m} t={t} live={live} region={region}
          replay={{ ...replay, stop: stopAll }}
          hls={hls} playing={hl}
          onPlayAll={playAll} onPlayOne={playSingle} onCursor={manualCursor}
          onAnalysis={(id) => onView('analysis', { incidentId: id })}
        />
        <p className="bc-foot">
          가상 데이터 · 순위 = 서버별 최근 5분 평균 체감 지연(유저 p95) · 기준 = 전일 동시간대 · 원인 판정과 근거는 분석 보드에서.
        </p>
      </main>
    </div>
  );
}
