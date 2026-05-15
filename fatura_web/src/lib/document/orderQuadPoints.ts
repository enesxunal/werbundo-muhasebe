export type Point = { x: number; y: number };

/** Döndürülmüş fişler için güvenilir köşe sırası: sol-üst, sağ-üst, sağ-alt, sol-alt */
export function orderQuadPoints(pts: Point[]): Point[] {
  if (pts.length !== 4) return pts;
  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.x - p.y);
  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.min(...diff))];
  const bl = pts[diff.indexOf(Math.max(...diff))];
  return [tl, tr, br, bl];
}
