import type { CornerPoints } from "@/lib/document/loadJscanify";

type Point = { x: number; y: number };

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadAreaCorners(c: CornerPoints): number {
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

/** Algılanan dörtgen fotoğrafın tamamı mı? (masa/fiş ayrımı yok) */
export function isFullFrameQuad(c: CornerPoints, imgW: number, imgH: number): boolean {
  const margin = Math.min(imgW, imgH) * 0.04;
  const frameCorners: Point[] = [
    { x: 0, y: 0 },
    { x: imgW, y: 0 },
    { x: imgW, y: imgH },
    { x: 0, y: imgH },
  ];
  const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  let nearFrameCorner = 0;
  for (const p of pts) {
    for (const fc of frameCorners) {
      if (dist(p, fc) < margin * 2.5) {
        nearFrameCorner++;
        break;
      }
    }
  }
  if (nearFrameCorner >= 3) return true;

  const imgArea = imgW * imgH;
  const area = quadAreaCorners(c);
  if (area > imgArea * 0.88) {
    const insetX = imgW * 0.03;
    const insetY = imgH * 0.03;
    const allNearEdge = pts.every(
      (p) => p.x <= insetX || p.x >= imgW - insetX || p.y <= insetY || p.y >= imgH - insetY,
    );
    if (allNearEdge || nearFrameCorner >= 2) return true;
  }
  return false;
}

/** Çıktı gerçekten kırpılmış / düzeltilmiş mi? */
export function isMeaningfulScanOutput(
  source: HTMLCanvasElement,
  result: HTMLCanvasElement,
  corners?: CornerPoints,
): boolean {
  if (result.width < 32 || result.height < 32) return false;

  const wRatio = result.width / source.width;
  const hRatio = result.height / source.height;

  if (corners && isFullFrameQuad(corners, source.width, source.height)) return false;

  const srcArea = source.width * source.height;
  const outArea = result.width * result.height;

  if (corners) {
    const quadRatio = quadAreaCorners(corners) / srcArea;
    if (quadRatio > 0.85) return false;
  }

  if (wRatio > 0.9 && hRatio > 0.9 && outArea > srcArea * 0.8) return false;

  const srcAr = source.width / source.height;
  const outAr = result.width / result.height;
  const arChange = Math.abs(srcAr - outAr) / Math.max(srcAr, 0.01);
  if (arChange < 0.08 && wRatio > 0.85 && hRatio > 0.85) return false;

  return true;
}
