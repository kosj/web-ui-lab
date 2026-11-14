/**
 * 커맨드 센터 지도 기하 — Natural Earth 투영, 점묘(dot-matrix) 대륙, DC·통신사 노드 표시 위치.
 * 데이터: world-atlas land-110m (Natural Earth 1:110m, 퍼블릭 도메인).
 *
 * 투영: Natural Earth I (등적도 아니고 등각도 아닌 절충 투영 — 세계 전도에서 왜곡이 고르게 퍼져 읽기 쉽다).
 * 중심 경도를 동경 18°로 돌리고 서경 130°~동경 190°, 남위 40°~북위 70°만 화면에 맞춰
 * 북미 서해안부터 일본 동쪽 태평양까지 담는다 (남극·남태평양 제외).
 */
import { geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, MultiPoint, MultiPolygon, Polygon } from 'geojson';
import land110 from 'world-atlas/land-110m.json';
import { REGION_ISPS, type RegionId } from '../data/config';

/** 권역 DC 실제 좌표 [경도, 위도] */
export const DC_LONLAT: Record<RegionId, [number, number]> = {
  KR: [126.44, 37.46], // 인천
  JP: [140.39, 35.77], // 나리타
  TW: [121.23, 25.08], // 타오위안
  SEA: [103.99, 1.36], // 싱가포르
  NA: [-77.45, 38.95], // 버지니아(덜레스)
  EU: [8.57, 50.03], // 프랑크푸르트
};

/**
 * 노드 표시 위치 보정 (지도 폭 1000 기준 px). 동아시아 세 DC는 세계 지도에서 수십 px 안에 몰려
 * 통신사 위성이 겹친다 → 실제 위치에는 작은 표식을 남기고 노드는 빈 공간으로 옮겨 지시선으로 잇는다
 * (지도 제작의 "변위(displacement)" 일반화).
 */
export const NODE_OFFSET: Record<RegionId, [number, number]> = {
  NA: [0, 0],
  EU: [0, 6],
  KR: [-70, -62],
  JP: [92, -30],
  TW: [118, 70],
  SEA: [10, 78],
};

/** 지역 카드가 붙기를 바라는 방향 — 실제 위치는 placeCards가 가장자리·다른 카드·노드를 피해 정한다 */
export const CARD_SIDE: Record<RegionId, 'left' | 'right' | 'top' | 'bottom'> = {
  NA: 'bottom',
  EU: 'right',
  KR: 'left',
  JP: 'top',
  TW: 'bottom',
  SEA: 'left',
};

/** 통신사 위성이 놓이는 호의 중심 방향(도, 0 = 오른쪽, 시계 방향) — 지시선·카드 반대쪽 */
const SAT_DIR: Record<RegionId, number> = {
  NA: -90,
  EU: 180,
  KR: -60,
  JP: 45,
  TW: -30,
  SEA: 45,
};

const FRAME: MultiPoint = {
  type: 'MultiPoint',
  coordinates: [-130, 0, 190].flatMap((lon) => [-40, 0, 70].map((lat) => [lon, lat])),
};

let landCache: Feature<Polygon | MultiPolygon> | null = null;
function land(): Feature<Polygon | MultiPolygon> {
  if (!landCache) {
    const topo = land110 as unknown as Parameters<typeof feature>[0] & { objects: Record<string, Parameters<typeof feature>[1]> };
    const fc = feature(topo, topo.objects.land) as unknown as FeatureCollection<Polygon | MultiPolygon> | Feature<Polygon | MultiPolygon>;
    landCache = 'features' in fc ? fc.features[0] : fc;
  }
  return landCache;
}

export interface MapGeometry {
  w: number;
  h: number;
  /** 지도 폭 1000 기준 배율 */
  u: number;
  projection: GeoProjection;
}

/**
 * 투영을 상자(w×h)에 맞춘다. h를 주지 않으면 화면 비율대로 높이를 정한다.
 * 상자가 더 높으면 폭에 맞춘 채 세로 가운데에 두어 위아래로 위도를 더 보여 준다(빈 띠를 남기지 않는다).
 * 상자가 더 납작하면 높이에 맞춰 줄인다.
 */
export function makeGeometry(w: number, h?: number): MapGeometry {
  const pad = 6;
  const projection = geoNaturalEarth1().rotate([-18, 0]).fitWidth(Math.max(10, w - pad * 2), FRAME);
  const [[, y0], [, y1]] = geoPath(projection).bounds(FRAME);
  const natural = Math.round(y1 - y0 + pad * 2);
  let H = h && Number.isFinite(h) ? h : natural;
  if (H >= natural) {
    const [tx, ty] = projection.translate();
    projection.translate([tx + pad, ty + (H - natural) / 2 + pad]);
  } else {
    projection.fitExtent([[pad, pad], [w - pad, H - pad]], FRAME);
  }
  H = Math.round(H);
  const b = geoPath(projection).bounds(FRAME);
  const u = (b[1][0] - b[0][0]) / 1000;
  return { w, h: H, u, projection };
}

/** 대륙을 점으로 — 화면 격자마다 육지인지 오프스크린 캔버스 픽셀로 판정 (육각 배치) */
export function landDots(g: MapGeometry, step: number): Float32Array {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(g.w);
  cv.height = Math.ceil(g.h);
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Float32Array();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  geoPath(g.projection, ctx)(land());
  ctx.fill();
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const out: number[] = [];
  let row = 0;
  for (let y = step / 2; y < cv.height; y += step * 0.866, row++) {
    const shift = (row % 2) * (step / 2);
    for (let x = step / 2 + shift; x < cv.width; x += step) {
      const i = (Math.floor(y) * cv.width + Math.floor(x)) * 4 + 3;
      if (data[i] > 0) out.push(x, y);
    }
  }
  return new Float32Array(out);
}

export interface NodeLayout {
  /** DC 실제 위치(투영) */
  geo: [number, number];
  /** 노드 표시 위치 */
  node: [number, number];
  /** 통신사 위성 위치 — REGION_ISPS 순서 */
  sats: [number, number][];
  /** 위성 궤도 반지름 */
  ring: number;
}

export function nodeLayout(g: MapGeometry): Record<RegionId, NodeLayout> {
  const out = {} as Record<RegionId, NodeLayout>;
  const ring = Math.max(18, 52 * g.u);
  const m = ring + 6;
  (Object.keys(DC_LONLAT) as RegionId[]).forEach((r) => {
    const p = g.projection(DC_LONLAT[r]) as [number, number];
    const [dx, dy] = NODE_OFFSET[r];
    const node: [number, number] = [
      Math.min(g.w - m, Math.max(m, p[0] + dx * g.u)),
      Math.min(g.h - m, Math.max(m, p[1] + dy * g.u)),
    ];
    const isps = REGION_ISPS[r];
    // 위성은 노드 둘레 180° 호에 고르게 — 지시선·카드 쪽은 비워 둔다
    const spread = 180;
    const sats = isps.map((_, i) => {
      const a = ((SAT_DIR[r] - spread / 2 + (spread * (i + 0.5)) / isps.length) * Math.PI) / 180;
      return [node[0] + Math.cos(a) * ring, node[1] + Math.sin(a) * ring] as [number, number];
    });
    out[r] = { geo: p, node, sats, ring };
  });
  return out;
}

export type CardSize = 'full' | 'mid' | 'compact';
/** 지도 배율별 카드 크기 — CSS(.cc-node-card, .is-mid, .is-compact)와 같은 값 */
export function cardSize(u: number): { size: CardSize; w: number; h: number; gapExtra: number } {
  if (u >= 1) return { size: 'full', w: 108, h: 70, gapExtra: 8 };
  if (u >= 0.66) return { size: 'mid', w: 92, h: 46, gapExtra: 6 };
  return { size: 'compact', w: 70, h: 32, gapExtra: 3 };
}

type Side = 'left' | 'right' | 'top' | 'bottom' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
const SIDES: Side[] = ['right', 'left', 'top', 'bottom', 'top-right', 'top-left', 'bottom-right', 'bottom-left'];
export interface CardRect { x: number; y: number; w: number; h: number }

function overlap(a: CardRect, b: CardRect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * 지역 카드 배치 — 탐욕적 라벨 배치(cartographic label placement의 가장 단순한 형태).
 * 권역마다 8방향 후보를 만들고 벌점(지도 밖 > 다른 카드 > 다른 노드 궤도 > DC 실제 위치 표식 > 선호 방향 순위)이
 * 가장 작은 곳을 고른다. 화면 폭이 바뀌어도 카드가 잘리거나 겹치지 않게 한다.
 */
export function placeCards(lay: Record<RegionId, NodeLayout>, g: MapGeometry, card: { w: number; h: number }, gap: number) {
  const order: RegionId[] = ['EU', 'NA', 'KR', 'JP', 'TW', 'SEA'];
  const placed: CardRect[] = [];
  const out = {} as Record<RegionId, CardRect>;
  for (const r of order) {
    const [nx, ny] = lay[r].node;
    const d = gap * 0.72;
    const cand: Record<Side, [number, number]> = {
      right: [nx + gap, ny - card.h / 2],
      left: [nx - gap - card.w, ny - card.h / 2],
      top: [nx - card.w / 2, ny - gap - card.h],
      bottom: [nx - card.w / 2, ny + gap],
      'top-right': [nx + d, ny - d - card.h],
      'top-left': [nx - d - card.w, ny - d - card.h],
      'bottom-right': [nx + d, ny + d],
      'bottom-left': [nx - d - card.w, ny + d],
    };
    const prefs = [CARD_SIDE[r] as Side, ...SIDES.filter((s) => s !== CARD_SIDE[r])];
    // 가까운 8방향이 모두 막히면 한 단계 먼 8방향 (지시선 없이도 가장 가까운 노드로 읽힌다)
    const far = 0.45 * (card.w + card.h) / 2;
    const tries = [
      ...prefs.map((side) => cand[side]),
      ...prefs.map((side) => {
        const [x, y] = cand[side];
        const cx = x + card.w / 2 - nx;
        const cy = y + card.h / 2 - ny;
        const l = Math.hypot(cx, cy) || 1;
        return [x + (cx / l) * far, y + (cy / l) * far] as [number, number];
      }),
    ];
    let best: CardRect | null = null;
    let bestScore = Infinity;
    tries.forEach(([x, y], rank) => {
      const rect = { x, y, w: card.w, h: card.h };
      const inside = overlap(rect, { x: 2, y: 2, w: g.w - 4, h: g.h - 4 });
      let score = (card.w * card.h - inside) * 20 + rank * 40;
      for (const p of placed) score += overlap(rect, { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 }) * 8;
      for (const o of order) {
        const L = lay[o];
        if (o !== r) {
          const R = L.ring * 0.9;
          score += overlap(rect, { x: L.node[0] - R, y: L.node[1] - R, w: R * 2, h: R * 2 }) * 3;
        }
        const [gx, gy] = L.geo;
        if (gx > x - 6 && gx < x + card.w + 6 && gy > y - 6 && gy < y + card.h + 6) score += 600;
      }
      if (score < bestScore) { bestScore = score; best = rect; }
    });
    out[r] = best!;
    placed.push(best!);
  }
  return out;
}
