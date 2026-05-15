import { ensureOpenCvLoaded } from "@/lib/document/loadOpenCv";

type Point = { x: number; y: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadAreaPts(pts: Point[]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(sum) / 2;
}

function orderQuadPoints(pts: Point[]): Point[] {
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  return [top[0], top[1], bottom[1], bottom[0]];
}

function outputSizeFromPoints(pts: Point[]): { w: number; h: number } {
  const [tl, tr, br, bl] = orderQuadPoints(pts);
  const w = Math.max(dist(tl, tr), dist(bl, br));
  const h = Math.max(dist(tl, bl), dist(tr, br));
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}

function isValidQuad(pts: Point[], imgW: number, imgH: number): boolean {
  if (pts.length !== 4) return false;
  if (pts.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const imgArea = imgW * imgH;
  const area = quadAreaPts(pts);
  if (area < imgArea * 0.04) return false;
  if (area > imgArea * 0.97) return false;
  const { w, h } = outputSizeFromPoints(pts);
  if (w < 60 || h < 60) return false;
  const ar = Math.max(w, h) / Math.min(w, h);
  if (ar > 25) return false;
  return true;
}

function resizeCanvasForDetect(source: HTMLCanvasElement, maxW: number): { canvas: HTMLCanvasElement; scale: number } {
  if (source.width <= maxW) return { canvas: source, scale: 1 };
  const scale = maxW / source.width;
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return { canvas: source, scale: 1 };
  ctx.drawImage(source, 0, 0, w, h);
  return { canvas: c, scale };
}

function matToPointsFromApprox(approx: Cv, scaleBack: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push({
      x: (approx.data32S[i * 2] ?? 0) / scaleBack,
      y: (approx.data32S[i * 2 + 1] ?? 0) / scaleBack,
    });
  }
  return pts;
}

function searchContoursForQuad(
  cv: Cv,
  edgeMat: Cv,
  detectW: number,
  detectH: number,
  fullW: number,
  fullH: number,
  scaleBack: number,
  mode: number,
): Point[] | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let best: Point[] | null = null;
  let bestArea = 0;
  const detectArea = detectW * detectH;

  try {
    cv.findContours(edgeMat, contours, hierarchy, mode, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area < detectArea * 0.04 || area > detectArea * 0.97) continue;
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        const pts = matToPointsFromApprox(approx, scaleBack);
        if (isValidQuad(pts, fullW, fullH) && area > bestArea) {
          bestArea = area;
          best = pts;
        }
      }
      approx.delete();
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }

  return best;
}

function findBestQuad(cv: Cv, gray: Cv, fullW: number, fullH: number, scaleBack: number): Point[] | null {
  const detectW = Math.round(fullW * scaleBack);
  const detectH = Math.round(fullH * scaleBack);
  let best: Point[] | null = null;
  let bestArea = 0;

  const pick = (pts: Point[] | null) => {
    if (!pts) return;
    const a = quadAreaPts(pts);
    if (a > bestArea) {
      bestArea = a;
      best = pts;
    }
  };

  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

  for (const [low, high] of [
    [50, 150],
    [30, 120],
    [75, 200],
  ] as const) {
    const edges = new cv.Mat();
    cv.Canny(blurred, edges, low, high);
    pick(searchContoursForQuad(cv, edges, detectW, detectH, fullW, fullH, scaleBack, cv.RETR_LIST));
    edges.delete();
  }

  const thresh = new cv.Mat();
  cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);
  const edges2 = new cv.Mat();
  cv.Canny(thresh, edges2, 50, 150);
  pick(searchContoursForQuad(cv, edges2, detectW, detectH, fullW, fullH, scaleBack, cv.RETR_EXTERNAL));
  thresh.delete();
  edges2.delete();
  blurred.delete();

  return best;
}

function warpDocument(cv: Cv, source: HTMLCanvasElement, pts: Point[]): HTMLCanvasElement | null {
  const ordered = orderQuadPoints(pts);
  let { w, h } = outputSizeFromPoints(ordered);
  const maxEdge = 2400;
  if (Math.max(w, h) > maxEdge) {
    const s = maxEdge / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0].x,
    ordered[0].y,
    ordered[1].x,
    ordered[1].y,
    ordered[2].x,
    ordered[2].y,
    ordered[3].x,
    ordered[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const src = cv.imread(source);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(w, h), cv.INTER_LINEAR, cv.BORDER_REPLICATE);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  cv.imshow(out, dst);

  src.delete();
  dst.delete();
  M.delete();
  srcTri.delete();
  dstTri.delete();

  return out;
}

/** jscanify olmazsa: Canny + kontur (fiş, ahşap zemin, eğik çekim) */
export async function scanDocumentWithOpenCv(source: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  try {
    await ensureOpenCvLoaded();
    const cv = (typeof window !== "undefined" ? window.cv : null) as Cv | undefined;
    if (!cv?.imread) return null;

    const attempts = [
      { maxW: 1400, contrast: 1.25 },
      { maxW: 1000, contrast: 1.4 },
      { maxW: 1800, contrast: 1.1 },
    ];

    for (const { maxW, contrast } of attempts) {
      const { canvas: detectCanvas, scale } = resizeCanvasForDetect(source, maxW);
      const prep = document.createElement("canvas");
      prep.width = detectCanvas.width;
      prep.height = detectCanvas.height;
      const pctx = prep.getContext("2d");
      if (!pctx) continue;
      pctx.filter = `contrast(${contrast}) brightness(1.06)`;
      pctx.drawImage(detectCanvas, 0, 0);
      pctx.filter = "none";

      const rgba = cv.imread(prep);
      const gray = new cv.Mat();
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
      rgba.delete();

      const pts = findBestQuad(cv, gray, source.width, source.height, scale);
      gray.delete();

      if (pts) {
        const warped = warpDocument(cv, source, pts);
        if (warped && warped.width >= 32 && warped.height >= 32) return warped;
      }
    }

    return null;
  } catch {
    return null;
  }
}
