export type Point = { x: number; y: number };

/**
 * Köşeleri sol-üst, sağ-üst, sağ-alt, sol-alt sırasına koyar.
 * Üst/alt ayrımı sum/diff yerine y koordinatıyla yapılır (döndürülmüş fişlerde daha güvenilir).
 */
export function orderQuadPoints(pts: Point[]): Point[] {
  if (pts.length !== 4) return pts;

  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}
