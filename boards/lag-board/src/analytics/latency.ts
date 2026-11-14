/**
 * 체감 지연(Effective Latency, EL) 모델.
 *
 * 유저가 "렉"으로 느끼는 시간을 ms 단위 하나로 환산한다. 단위가 ms라서
 * 연구 기반 임계값(100/150/250/500ms)을 그대로 적용할 수 있고, 구성 요소가
 * 덧셈이라 원인별 기여도(누적 영역 차트)로 분해할 수 있다.
 *
 *   EL = 네트워크 + 서버 + 클라
 *   네트워크 = RTT p95 + 1.5 × 지터 + 50ms × 손실률(%)
 *   서버     = ½ × 틱 p99 + 1.5 × max(0, 틱 p99 − 50ms)
 *   클라     = ½ × 프레임 p95 + 1.5 × max(0, 프레임 p95 − 50ms)
 *
 * 가중치 근거
 *  - 지터 1.5배, 손실 큰 가중: MMORPG 실측에서 이탈 민감도가
 *    지연:지터:클라손실:서버손실 ≈ 1:2:4:3 (Chen et al., CACM 2006).
 *  - 손실 1%당 50ms: 대부분 MMORPG는 TCP — 손실 시 재전송 대기(RTO)가 체감 지연으로 전가됨.
 *  - 틱/프레임의 ½: 입력이 평균적으로 한 주기의 절반을 기다림. 예산 초과분은 스톨로 체감되어 가중.
 */

export const EL_PARAMS = {
  jitterWeight: 1.5,
  lossMsPerPct: 50,
  tickBudget: 50,
  overrunWeight: 1.5,
  frameStall: 50,
} as const;

export function netComponent(rttP95: number, jitter: number, lossPct: number) {
  return rttP95 + EL_PARAMS.jitterWeight * jitter + EL_PARAMS.lossMsPerPct * lossPct;
}

export function serverComponent(tickP99: number) {
  return 0.5 * tickP99 + EL_PARAMS.overrunWeight * Math.max(0, tickP99 - EL_PARAMS.tickBudget);
}

export function clientComponent(frameP95: number) {
  return 0.5 * frameP95 + EL_PARAMS.overrunWeight * Math.max(0, frameP95 - EL_PARAMS.frameStall);
}
