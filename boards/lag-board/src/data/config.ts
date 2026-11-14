/**
 * 렉 보드 도메인 설정 — 권역·서버·임계값·장애 시나리오.
 *
 * 체감 지연(Effective Latency, EL) 임계값 근거 (knowledge/lag-thresholds.md 참고):
 *  - ~100ms : 다수 연구에서 "지연을 알아채기 시작"하는 구간 (장르 평균 최소 인지 지연 < 100ms)
 *  - 150ms  : ShenZhou Online(MMORPG) 실측 — 150ms 유저 평균 4시간 플레이
 *  - 250ms  : 같은 연구 — 250ms 유저 평균 1시간 플레이(이탈 급증), WoW 커뮤니티 '빨간 막대' 관례
 *  - 500ms  : Claypool & Claypool(2006) — 3인칭 RPG의 허용 상한
 */

export type RegionId = 'KR' | 'JP' | 'TW' | 'SEA' | 'NA' | 'EU';
export type Cause = 'infra' | 'network' | 'server' | 'client';
export type Tier = 'smooth' | 'good' | 'notice' | 'warning' | 'critical';

export interface RegionDef {
  id: RegionId;
  name: string;
  city: string;
  dc: string;
  /** 현지 시간대 (UTC 오프셋, 시간) — 동접 일주기 곡선에 사용 */
  utcOffset: number;
  /** 정상 시 RTT p50 / p95 (ms) */
  rttP50: number;
  rttP95: number;
  /** 피크 동접 (서버당 평균) */
  peakCcu: number;
  servers: string[];
}

export const REGIONS: RegionDef[] = [
  { id: 'KR', name: '한국', city: '서울', dc: 'ICN', utcOffset: 9, rttP50: 16, rttP95: 28, peakCcu: 6200,
    servers: ['한빛', '미리내', '새벽별', '푸른솔', '해오름', '별무리', '가람', '다솜'] },
  { id: 'JP', name: '일본', city: '도쿄', dc: 'NRT', utcOffset: 9, rttP50: 20, rttP95: 36, peakCcu: 4800,
    servers: ['아침놀', '물비늘', '너울', '윤슬', '바람꽃', '나린'] },
  { id: 'TW', name: '대만', city: '타이베이', dc: 'TPE', utcOffset: 8, rttP50: 24, rttP95: 42, peakCcu: 4100,
    servers: ['라온', '여울', '하늬', '마루', '아라', '온새'] },
  { id: 'SEA', name: '동남아', city: '싱가포르', dc: 'SIN', utcOffset: 8, rttP50: 36, rttP95: 62, peakCcu: 3900,
    servers: ['산들', '누리', '슬기', '도담', '그린', '이든'] },
  { id: 'NA', name: '북미', city: '버지니아', dc: 'IAD', utcOffset: -5, rttP50: 40, rttP95: 70, peakCcu: 3600,
    servers: ['단비', '꽃샘', '은가람', '노을', '보라'] },
  { id: 'EU', name: '유럽', city: '프랑크푸르트', dc: 'FRA', utcOffset: 1, rttP50: 34, rttP95: 60, peakCcu: 3400,
    servers: ['소담', '해솔', '가온', '빛솔', '희나'] },
];

export const TIERS: { id: Tier; label: string; min: number; desc: string }[] = [
  { id: 'smooth', label: '쾌적', min: 0, desc: '지연을 거의 느끼지 못함' },
  { id: 'good', label: '양호', min: 100, desc: '민감한 유저부터 지연을 인지' },
  { id: 'notice', label: '주의', min: 150, desc: '체감 렉 — 플레이 시간 감소 시작' },
  { id: 'warning', label: '경고', min: 250, desc: '심한 렉 — 이탈 급증 구간' },
  { id: 'critical', label: '심각', min: 500, desc: 'RPG 허용 상한 초과 — 사실상 플레이 불가' },
];

export const THRESHOLDS = { good: 100, notice: 150, warning: 250, critical: 500 } as const;

export function tierOf(el: number): Tier {
  if (el >= THRESHOLDS.critical) return 'critical';
  if (el >= THRESHOLDS.warning) return 'warning';
  if (el >= THRESHOLDS.notice) return 'notice';
  if (el >= THRESHOLDS.good) return 'good';
  return 'smooth';
}

export const TIER_LABEL: Record<Tier, string> = Object.fromEntries(TIERS.map((t) => [t.id, t.label])) as Record<Tier, string>;

export const CAUSES: { id: Cause; label: string; short: string; desc: string }[] = [
  { id: 'infra', label: '인프라', short: 'INFRA', desc: '호스트·DC 자원 경합 (CPU steal, I/O 대기)' },
  { id: 'network', label: '네트워크', short: 'NET', desc: '구간 RTT·지터·패킷 손실' },
  { id: 'server', label: '서버', short: 'SRV', desc: '게임 서버 틱 처리 지연' },
  { id: 'client', label: '클라', short: 'CLI', desc: '클라이언트 프레임 스톨' },
];
export const CAUSE_LABEL: Record<Cause, string> = Object.fromEntries(CAUSES.map((c) => [c.id, c.label])) as Record<Cause, string>;

/** 서버 틱 예산 — 20Hz MMO 서버 기준 */
export const TICK_BUDGET_MS = 50;

/** 시뮬레이션 시간 축 */
export const MINUTE = 60_000;
/** "현재" 시각 — 2026-11-14 21:00 KST */
export const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);
/** 표시 범위 24h + 기준선 워밍업 25h (전일 동시간대 ±45분 계절성 기준선) */
export const WARMUP_MIN = 25 * 60;
export const VIEW_MIN = 24 * 60;
export const START = NOW - (WARMUP_MIN + VIEW_MIN - 1) * MINUTE;
export const TOTAL_MIN = WARMUP_MIN + VIEW_MIN;

/** KST 기준 시각 → epoch ms */
export function kst(day: number, h: number, m = 0) {
  return Date.UTC(2026, 10, day, h - 9, m, 0);
}

/**
 * 장애 시나리오 — 가상 데이터에 주입되는 "정답". 분류기 검증에 사용한다.
 * 분류기는 이 정보를 보지 않고 지표만으로 원인을 추정한다.
 */
export interface ScenarioDef {
  id: string;
  cause: Cause;
  title: string;
  start: number;
  end: number | null; // null = 진행 중
  /** 램프업(분) — 장애가 최대치에 도달하는 시간 */
  rampMin: number;
  target: { region?: RegionId; servers?: string[]; rack?: string; clientVersion?: string };
}

export const NEW_CLIENT_VERSION = '2.14.0';
export const OLD_CLIENT_VERSION = '2.13.2';
export const PATCH_TIME = kst(14, 18, 0);

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'S1', cause: 'server', title: 'JP-03 메모리 누수로 틱 지연',
    start: kst(14, 4, 10), end: kst(14, 5, 35), rampMin: 40,
    target: { region: 'JP', servers: ['JP-03'] },
  },
  {
    id: 'S2', cause: 'network', title: '동남아 해저 케이블 구간 손실',
    start: kst(14, 11, 20), end: kst(14, 13, 40), rampMin: 12,
    target: { region: 'SEA' },
  },
  {
    id: 'S3', cause: 'client', title: '2.14.0 패치 셰이더 컴파일 스톨',
    start: kst(14, 18, 5), end: null, rampMin: 20,
    target: { clientVersion: NEW_CLIENT_VERSION },
  },
  {
    id: 'S4', cause: 'infra', title: '서울 DC 랙 R2 호스트 자원 경합',
    start: kst(14, 20, 15), end: null, rampMin: 25,
    target: { region: 'KR', rack: 'R2' },
  },
];
