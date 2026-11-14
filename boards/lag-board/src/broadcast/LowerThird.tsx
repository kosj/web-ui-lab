import type { BoardModel } from '../analytics/model';
import { CAUSE_ICON } from '../components/Badges';
import { CAUSE_LABEL, TIER_LABEL, type Tier } from '../data/config';
import { hhmm } from '../lib/format';
import type { RaceMsg } from './race';

/**
 * 로워서드 — 새 장애가 감지·격상되는 순간 스테이지 아래에 6초간 뜨는 자막.
 * 방송 자막 관례: 3~6초 노출, 짧은 문장, 단색 바탕 위 고대비 글자. 등장은 왼쪽에서 닦아 내듯(와이프), 퇴장은 빠르게.
 */
export function LowerThird({ m, msg, leaving }: { m: BoardModel; msg: RaceMsg; leaving: boolean }) {
  const Icon = msg.cause ? CAUSE_ICON[msg.cause] : null;
  return (
    <div className={`bc-l3 ${leaving ? 'is-leaving' : ''} bc-l-${msg.level}`} role="status">
      <div className="bc-l3-top">
        <span className="bc-l3-kind">{msg.kind === 'escalate' ? '등급 격상' : '장애 감지'}</span>
        {msg.cause && Icon && <span className={`bc-l3-cause bc-c-${msg.cause}`}><Icon size={13} aria-hidden />{CAUSE_LABEL[msg.cause]}</span>}
        <span className="bc-l3-time num">{hhmm(m.ds.times[msg.idx])} KST</span>
        {msg.level !== 'info' && msg.level !== 'resolved' && <span className="bc-l3-tier">{TIER_LABEL[msg.level as Tier]}</span>}
      </div>
      <div className="bc-l3-main">
        <b>{msg.title}</b>
        <span>{msg.detail}</span>
      </div>
    </div>
  );
}
