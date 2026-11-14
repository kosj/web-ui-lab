/**
 * 렉 제보 채팅 표본 — 화면에 보여 줄 메시지 몇 개를 결정적으로(시드 고정) 만든다.
 * 수치 분석은 제보 수·유형 수만 쓰고, 이 문장들은 "유저 목소리" 예시일 뿐이다.
 * 닉네임은 서버명 + 해시 일부만 남기고 가린다.
 */
import type { BoardModel } from '../analytics/model';
import type { RegionId } from './config';
import { REPORT_CATEGORIES, type ReportCategory } from './chat';

type Lang = Record<ReportCategory, string[]>;

const KO: Lang = {
  stall: ['튕겼다 또', '순간이동함 ㅋㅋ', '끊김 왜이럼', '자꾸 멈췄다 움직임'],
  delay: ['핑 300 실화?', '스킬 씹힘', '반응 늦음', '평타가 늦게 나감'],
  frame: ['프레임 뚝뚝 끊김', '패치하고 버벅임 심함', '화면 멈칫멈칫'],
  loading: ['던전 입장 무한로딩', '로딩 왜 안끝남'],
  generic: ['렉?', '렉 걸림', '나만 렉임?'],
};
const JA: Lang = {
  stall: ['また落ちた', 'ワープしてる'],
  delay: ['ラグい', 'スキル遅延ひどい', '鯖重い'],
  frame: ['カクカクする', 'パッチ後fps低い'],
  loading: ['ダンジョン入れない'],
  generic: ['ラグ?', '重い'],
};
const ZH: Lang = {
  stall: ['又斷線了', '瞬移了'],
  delay: ['好卡', '延遲好高', '技能放不出來'],
  frame: ['掉幀', '更新後很卡'],
  loading: ['副本一直讀取', '進不去副本'],
  generic: ['卡卡的', 'lag?'],
};
const SEA: Lang = {
  stall: ['dc again', 'putus terus', 'หลุดอีกแล้ว'],
  delay: ['lag parah', 'ping 400 wtf', 'แลคมาก'],
  frame: ['fps drop after patch'],
  loading: ['stuck loading dungeon'],
  generic: ['lag?', 'ngelag'],
};
const EN: Lang = {
  stall: ['dc again', 'rubberbanding hard'],
  delay: ['laggy af', 'skills delayed', 'ping spike'],
  frame: ['fps tanked after patch', 'stuttering'],
  loading: ['stuck on dungeon loading'],
  generic: ['lag?', 'anyone else lagging'],
};
const EU: Lang = {
  ...EN,
  delay: ['lagt mega', 'ça lag', 'skills delayed'],
};
const LANG: Record<RegionId, Lang> = { KR: KO, JP: JA, TW: ZH, SEA, NA: EN, EU };
const SPAM: Partial<Record<RegionId, string>> = { NA: 'LAG KEKW', KR: '렉 ㅋㅋㅋㅋ' };

/** 키워드 강조용 — 메시지에서 렉을 가리키는 표현 */
export const KEYWORDS = ['렉', '핑', '튕', '끊김', '씹힘', '버벅', '프레임', '로딩', 'ラグ', '重い', '落ち', '卡', '延遲', '斷線', 'lag', 'dc', 'ping', 'fps', 'rubberbanding', 'stutter', 'putus', 'แลค', 'หลุด', 'ça lag', 'lagt'];

export interface ChatSample {
  key: string;
  t: number;
  serverId: string;
  nick: string;
  text: string;
  category: ReportCategory | 'spam';
}

function hash(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** [t−window, t] 동안 범위 안 서버에서 나온 제보 중 최근 것부터 최대 limit개 */
export function sampleMessages(m: BoardModel, ids: string[], t: number, window = 10, limit = 8): ChatSample[] {
  const out: ChatSample[] = [];
  const index = new Map(m.ds.servers.map((s, i) => [s.id, i]));
  for (let tt = t; tt >= Math.max(0, t - window) && out.length < limit; tt--) {
    for (const id of ids) {
      const ch = m.ds.chat[id];
      const sv = m.ds.servers[index.get(id)!];
      const lang = LANG[sv.region];
      const si = index.get(id)!;
      // 유형별 개수에서 순서대로 뽑는다 (분당 최대 2개만 노출)
      let shown = 0;
      for (const cat of REPORT_CATEGORIES) {
        const k = Math.min(2 - shown, Math.round(ch.cat[cat][tt]));
        for (let j = 0; j < k; j++) {
          const h = hash(si, tt, j + REPORT_CATEGORIES.indexOf(cat) * 7);
          const list = lang[cat];
          out.push({
            key: `${id}-${tt}-${cat}-${j}`, t: tt, serverId: id, category: cat,
            nick: `${sv.name}_${(h % 4096).toString(16).padStart(3, '0')}**`,
            text: list[h % list.length],
          });
          shown++;
        }
        if (shown >= 2) break;
      }
      if (ch.spamMsgs[tt] > 0 && SPAM[sv.region]) {
        const h = hash(si, tt, 99);
        out.push({ key: `${id}-${tt}-spam`, t: tt, serverId: id, category: 'spam', nick: `viewer_${(h % 4096).toString(16)}**`, text: SPAM[sv.region]! });
      }
    }
  }
  return out.slice(0, limit);
}
