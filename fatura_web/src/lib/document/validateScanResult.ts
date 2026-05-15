type Point = { x: number; y: number };

type CornerPoints = {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomLeftCorner: Point;
  bottomRightCorner: Point;
};

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

/** Görüntüde içerik (fiş) gerçekten geniş alana yayılmış mı? İnce şeritleri yakalar. */
export function hasGoodContentSpread(canvas: HTMLCanvasElement): boolean {
  const sw = Math.min(240, canvas.width);
  const sh = Math.min(240, canvas.height);
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  if (!sctx) return false;
  sctx.drawImage(canvas, 0, 0, sw, sh);
  const data = sctx.getImageData(0, 0, sw, sh).data;

  let minX = sw;
  let maxX = 0;
  let minY = sh;
  let maxY = 0;
  let ink = 0;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r < 235 || g < 235 || b < 235) {
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (ink < sw * sh * 0.01) return false;

  const xSpread = (maxX - minX + 1) / sw;
  const ySpread = (maxY - minY + 1) / sh;
  if (xSpread < 0.28 || ySpread < 0.28) return false;

  return true;
}

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
  if (area > imgArea * 0.88 && nearFrameCorner >= 2) return true;
  return false;
}

export function isMeaningfulScanOutput(
  source: HTMLCanvasElement | HTMLImageElement,
  result: HTMLCanvasElement,
  corners?: CornerPoints,
): boolean {
  const srcW = "naturalWidth" in source ? source.naturalWidth || source.width : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight || source.height : source.height;

  if (result.width < 80 || result.height < 80) return false;
  if (!hasGoodContentSpread(result)) return false;

  const minOut = Math.min(result.width, result.height);
  const maxOut = Math.max(result.width, result.height);
  if (minOut / maxOut < 0.12) return false;
  if (minOut < Math.min(srcW, srcH) * 0.15) return false;

  const wRatio = result.width / srcW;
  const hRatio = result.height / srcH;
  if (corners && isFullFrameQuad(corners, srcW, srcH)) return false;

  const srcArea = srcW * srcH;
  const outArea = result.width * result.height;

  if (corners) {
    const quadRatio = quadAreaCorners(corners) / srcArea;
    if (quadRatio > 0.85) return false;
  }

  if (wRatio > 0.92 && hRatio > 0.92 && outArea > srcArea * 0.82) return false;

  const srcAr = srcW / srcH;
  const outAr = result.width / result.height;
  const arChange = Math.abs(srcAr - outAr) / Math.max(srcAr, 0.01);
  if (arChange < 0.06 && wRatio > 0.88 && hRatio > 0.88) return false;

  return true;
}
