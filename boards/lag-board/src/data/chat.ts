/**
 * 채팅 렉 제보 — 가상 데이터 생성.
 *
 * 유저 1명이 1분 동안 렉을 제보할 확률(위험률)을 아래처럼 두고, 서버별 채팅 유저 수에 곱해 포아송으로 뽑는다.
 *
 *   h(t) = Σ_통신사 비중 × p0 × exp(β · max(0, ln(EL_통신사/T*))) × exp(γ · min(8, 재전송 초과 %p)) × 사각지대 배수
 *   (EL_통신사 = 그 통신사 경로의 네트워크 성분 + 서버·클라 성분 — 유저는 자기 경로의 렉을 겪는다)
 *
 *   - T* = 175ms : "진짜" 체감 꺾임점. 분석(분절 포아송 회귀)이 이 값을 되찾는지 테스트한다.
 *   - β = 3      : 꺾임점 이후 EL이 2배가 되면 제보 위험률 약 8배
 *   - γ = 0.35   : 같은 EL이라도 TCP 재전송이 1%p 늘면 제보 ×1.42 — 재전송은 HOL 블로킹으로 '멈칫·순간이동'을 만든다
 *   - 제보는 체감 후 1~12분에 걸쳐 나온다(기하 분포, 평균 약 2.9분) → 교차상관이 이 지연을 찾아야 한다
 *   - 렉이 아주 심하면(EL 400ms↑) 튕겨서 채팅을 못 하는 유저가 생겨 채팅 유저 자체가 줄어든다
 *   - 포화: 실제 확률 = pMax × (1 − e^(−h/pMax)) — 심한 장애에서 제보율이 무한히 늘지 않는다
 *   - 프레임 끊김은 네트워크와 무관하게 체감된다 → 클라 장애는 "재전송 없는 제보"를 만든다
 *
 * 분류 결과(메시지 유형)도 함께 만든다: 끊김·튕김(stall) / 지연·스킬 씹힘(delay) / 프레임(frame) / 로딩(loading) / 일반(generic).
 * 분석기는 이 생성 규칙을 모르고, 관측 가능한 수치(제보 수·채팅 유저 수·유형 수)만 본다.
 */
import { clientComponent, netComponent, serverComponent } from '../analytics/latency';
import { clamp, gaussian } from '../analytics/stats';
import { kst, MINUTE, REGION_ISPS, type RegionId } from './config';
import type { Dataset } from './generate';

export const CHAT_MODEL = {
  p0: 0.002,
  /** 포화: 아무리 심해도 분당 제보 확률은 8%를 넘기 어렵다 (모두가 채팅하지는 않는다) */
  pMax: 0.08,
  /** 프레임 끊김 민감도: 신버전 유저는 프레임 p95가 33ms(30fps) 초과 16.7ms마다 ×e^0.5 */
  frameSens: 0.5,
  breakpoint: 175,
  beta: 3,
  gamma: 0.35,
  /** 제보 지연 커널: k=1..12분, 비율 0.65 기하 감소 */
  delayRatio: 0.65,
  delayMax: 12,
};

/** 분당 채팅하는 유저 비율 — 권역별 채팅 문화 차이 */
export const CHAT_RATE: Record<RegionId, number> = { KR: 0.06, JP: 0.03, TW: 0.05, SEA: 0.05, NA: 0.04, EU: 0.035 };

export type ReportCategory = 'stall' | 'delay' | 'frame' | 'loading' | 'generic';
export const REPORT_CATEGORIES: ReportCategory[] = ['stall', 'delay', 'frame', 'loading', 'generic'];
export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  stall: '끊김·튕김', delay: '지연·스킬 씹힘', frame: '프레임 끊김', loading: '로딩 지연', generic: '단순 렉',
};

export interface ChatMetrics {
  /** 분당 채팅한 유저 수 */
  chatters: Float32Array;
  /** 렉 제보 유저 수(유저 단위 중복 제거, 도배 포함 원시) */
  reporters: Float32Array;
  /** 렉 제보 메시지 수(같은 유저 반복 포함) */
  msgs: Float32Array;
  /** 동일 문구 도배 — 메시지 수와 도배 유저 수 */
  spamMsgs: Float32Array;
  spamUsers: Float32Array;
  /** 유형별 제보 유저 수 (도배 제외) */
  cat: Record<ReportCategory, Float32Array>;
}

/**
 * 제보 전용 시나리오 — 지표에는 안 보이는 것들.
 *  V1 측정 사각지대: 대만 던전 입장 로딩 지연 (서버 로그·RTT·틱 모두 정상, 유저만 체감)
 *  V2 도배: 북미 스트리머 방문으로 "LAG KEKW" 동일 문구 연타 — 장애로 오탐하면 안 된다
 */
export const VOICE_SCENARIOS = [
  { id: 'V1', kind: 'blindspot' as const, title: '대만 던전 입장 로딩 지연', region: 'TW' as RegionId, servers: ['TW-01', 'TW-02', 'TW-03'], start: kst(14, 13, 40), end: kst(14, 14, 30), mult: 16 },
  { id: 'V2', kind: 'spam' as const, title: '북미 스트리머 방문 도배', region: 'NA' as RegionId, servers: ['NA-02'], start: kst(14, 2, 10), end: kst(14, 2, 25), users: 25, perUser: 6 },
];

function poisson(lambda: number, rand: () => number) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gaussian(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rand(); } while (p > L);
  return k - 1;
}

function binomial(n: number, p: number, rand: () => number) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 40) return clamp(Math.round(n * p + Math.sqrt(n * p * (1 - p)) * gaussian(rand)), 0, n);
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

export function generateChat(ds: Dataset, rand: () => number): Record<string, ChatMetrics> {
  const n = ds.minutes;
  const out: Record<string, ChatMetrics> = {};
  const { p0, pMax, frameSens, breakpoint, beta, gamma, delayRatio, delayMax } = CHAT_MODEL;
  const kernel = Array.from({ length: delayMax }, (_, i) => delayRatio ** i);
  const ksum = kernel.reduce((a, b) => a + b, 0);

  for (const sv of ds.servers) {
    const m = ds.metrics[sv.id];
    const rate = CHAT_RATE[sv.region];
    const net = new Float32Array(n);
    const srv = new Float32Array(n);
    const cli = new Float32Array(n);
    const el = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      net[t] = netComponent(m.rttP95[t], m.jitter[t], m.loss[t]);
      srv[t] = serverComponent(m.tickP99[t]);
      cli[t] = clientComponent(m.frameP95[t]);
      el[t] = net[t] + srv[t] + cli[t];
    }
    const ref = (arr: Float32Array, t: number) => arr[t >= 1440 ? t - 1440 : t];
    const blind = VOICE_SCENARIOS.find((v) => v.kind === 'blindspot' && v.servers.includes(sv.id));
    const spam = VOICE_SCENARIOS.find((v) => v.kind === 'spam' && v.servers.includes(sv.id));

    // 1) 체감 위험률 (지연 전) — 통신사 집단별로 계산해 유저 비중으로 섞는다
    const raw = new Float64Array(n);
    const blindAt = new Float32Array(n);
    const paths = REGION_ISPS[sv.region].map((d) => ds.isp[sv.region][d.id]);
    const shares = ds.ispShare[sv.id];
    for (let t = 0; t < n; t++) {
      const ts = ds.times[t];
      const bm = blind && ts >= blind.start && ts < blind.end ? (blind.mult ?? 1) * Math.min(1, (ts - blind.start) / (8 * MINUTE)) : 0;
      blindAt[t] = bm;
      let hz = 0;
      paths.forEach((p, i) => {
        const elI = netComponent(p.rttP95[t], p.jitter[t], p.loss[t]) + srv[t] + cli[t];
        const rx = Math.min(8, Math.max(0, p.retrans[t] - p.retrans[t >= 1440 ? t - 1440 : t]));
        hz += shares[i] * Math.exp(beta * Math.max(0, Math.log(elI / breakpoint))) * Math.exp(gamma * rx);
      });
      // 클라 버전별 프레임 끊김 체감
      const ns = m.newShare[t];
      const stall = ns > 0 && Number.isFinite(m.frameNew[t]) ? Math.exp(frameSens * Math.max(0, (m.frameNew[t] - 33) / 16.7)) : 1;
      const h = p0 * hz * ((1 - ns) + ns * stall) * (1 + bm);
      raw[t] = pMax * (1 - Math.exp(-h / pMax));
    }

    const c: ChatMetrics = {
      chatters: new Float32Array(n), reporters: new Float32Array(n), msgs: new Float32Array(n),
      spamMsgs: new Float32Array(n), spamUsers: new Float32Array(n),
      cat: { stall: new Float32Array(n), delay: new Float32Array(n), frame: new Float32Array(n), loading: new Float32Array(n), generic: new Float32Array(n) },
    };

    for (let t = 0; t < n; t++) {
      // 2) 지연 커널: 체감 후 1~12분에 걸쳐 제보
      let h = 0;
      for (let k = 1; k <= delayMax; k++) if (t - k >= 0) h += kernel[k - 1] * raw[t - k];
      h /= ksum;
      // 3) 채팅 유저: 심하게 튕기면 채팅 자체를 못 한다
      const cantChat = 0.4 * clamp((el[t] - 400) / 400, 0, 1);
      const chatters = Math.max(0, m.ccu[t] * rate * (1 + 0.05 * gaussian(rand)) * (1 - cantChat));
      const reporters = Math.min(Math.round(chatters), poisson(chatters * h, rand));
      c.chatters[t] = chatters;
      c.reporters[t] = reporters;

      // 4) 유형 분류 결과: 각 성분의 전일 대비 초과에 비례 (기본은 단순 렉)
      const t2 = Math.max(0, t - 2);
      // 손실·재전송은 '끊김·튕김'으로, RTT·지터·서버 지연은 '지연·스킬 씹힘'으로 표현된다
      const delayNet = m.rttP95[t2] + 1.5 * m.jitter[t2] - (ref(m.rttP95, t2) + 1.5 * ref(m.jitter, t2));
      const w: Record<ReportCategory, number> = {
        stall: Math.max(0, Math.exp(gamma * Math.max(0, m.retrans[t2] - ref(m.retrans, t2))) - 1) * 3,
        delay: Math.max(0, delayNet / 40) + Math.max(0, (srv[t2] - ref(srv, t2)) / 40),
        frame: Math.max(0, (cli[t2] - ref(cli, t2)) / 40),
        loading: blindAt[t2] / 2,
        generic: 1,
      };
      let left = reporters;
      let wLeft = REPORT_CATEGORIES.reduce((a, k) => a + w[k], 0);
      for (const k of REPORT_CATEGORIES) {
        const x = k === 'generic' ? left : binomial(left, w[k] / wLeft, rand);
        c.cat[k][t] = x;
        left -= x;
        wLeft -= w[k];
      }
      c.msgs[t] = reporters + poisson(0.4 * reporters, rand);

      // 5) 도배: 소수 유저가 같은 문구를 연타
      if (spam) {
        const ts = ds.times[t];
        if (ts >= spam.start && ts < spam.end) {
          const users = Math.round((spam.users ?? 0) * (0.8 + 0.4 * rand()));
          c.spamUsers[t] = users;
          c.spamMsgs[t] = users * (spam.perUser ?? 1);
        }
      }
    }
    out[sv.id] = c;
  }
  return out;
}
