import { CircleCheck, Circle, Cpu, MonitorSmartphone, OctagonAlert, OctagonX, Server, TriangleAlert, Waypoints } from 'lucide-react';
import { CAUSE_LABEL, TIER_LABEL, type Cause, type Tier } from '../data/config';

export const CAUSE_ICON: Record<Cause, typeof Server> = {
  infra: Server,
  network: Waypoints,
  server: Cpu,
  client: MonitorSmartphone,
};

export const TIER_ICON: Record<Tier, typeof Circle> = {
  smooth: CircleCheck,
  good: Circle,
  notice: TriangleAlert,
  warning: OctagonAlert,
  critical: OctagonX,
};

/** 원인 배지: 색 점 + 아이콘 + 한글 라벨 — 색만으로 구분하지 않는다 */
export function CauseBadge({ cause, size = 'm' }: { cause: Cause; size?: 's' | 'm' }) {
  const Icon = CAUSE_ICON[cause];
  return (
    <span className={`cause-badge cause-${cause} size-${size}`}>
      <Icon size={size === 's' ? 12 : 13} strokeWidth={2.2} aria-hidden />
      {CAUSE_LABEL[cause]}
    </span>
  );
}

export function TierPill({ tier, resolved = false }: { tier: Tier; resolved?: boolean }) {
  if (resolved) {
    return (
      <span className="tier-pill tier-resolved">
        <CircleCheck size={12} strokeWidth={2.4} aria-hidden />
        해소
      </span>
    );
  }
  const Icon = TIER_ICON[tier];
  return (
    <span className={`tier-pill tier-${tier}`}>
      <Icon size={12} strokeWidth={2.4} aria-hidden />
      {TIER_LABEL[tier]}
    </span>
  );
}
