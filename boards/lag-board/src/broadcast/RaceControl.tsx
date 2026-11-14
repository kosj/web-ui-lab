import { CheckCircle2, EyeOff, Rocket } from 'lucide-react';
import type { BoardModel } from '../analytics/model';
import { CAUSE_ICON, TIER_ICON } from '../components/Badges';
import { CAUSE_LABEL, type Tier } from '../data/config';
import { hhmm } from '../lib/format';
import type { RaceMsg } from './race';

/**
 * 관제 메시지 (레이스 컨트롤) — 그 시점까지 나온 메시지, 최신이 위. 재생하면 실제 순서대로 쌓인다.
 * 감지·격상은 등급색 머리말, 해소는 흰 체크, 배포·사각지대는 회색 정보.
 */
export function RaceControl({ m, msgs, t, onPick }: { m: BoardModel; msgs: RaceMsg[]; t: number; onPick: (msg: RaceMsg) => void }) {
  const seen = msgs.filter((x) => x.idx <= t).reverse();
  return (
    <section className="bc-panel bc-rc" aria-labelledby="bc-rc-title">
      <header className="bc-tab">
        <h2 id="bc-rc-title">관제 메시지</h2>
        <span>RACE CONTROL · {seen.length}건</span>
      </header>
      <ol className="bc-rc-list">
        {seen.map((x) => {
          const lvl = x.level;
          const Icon = x.kind === 'resolve' ? CheckCircle2 : x.kind === 'deploy' ? Rocket : x.kind === 'blind' ? EyeOff : TIER_ICON[lvl as Tier];
          const CIcon = x.cause ? CAUSE_ICON[x.cause] : null;
          return (
            <li key={x.id} className={`bc-msg bc-l-${lvl} kind-${x.kind}`}>
              <button type="button" onClick={() => onPick(x)} disabled={!x.incidentId && x.kind !== 'blind'}>
                <span className="bc-msg-time num">{hhmm(m.ds.times[x.idx])}</span>
                <span className="bc-msg-tag"><Icon size={12} strokeWidth={2.6} aria-hidden />{x.tag}</span>
                {CIcon && x.cause && <span className={`bc-cause mini bc-c-${x.cause}`}><CIcon size={11} aria-hidden />{CAUSE_LABEL[x.cause]}</span>}
                <span className="bc-msg-title">{x.title}</span>
                <span className="bc-msg-detail">{x.detail}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
