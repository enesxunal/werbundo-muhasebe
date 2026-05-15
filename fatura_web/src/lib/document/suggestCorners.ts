import type { Point } from "@/lib/document/orderQuadPoints";

/** Ham fotoğrafta içeriğin sınır kutusundan başlangıç köşeleri (0–1) */
export function suggestCornersNormalized(source: HTMLCanvasElement): Point[] {
  const sw = Math.min(400, source.width);
  const sh = Math.min(400, source.height);
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return [
      { x: 0.1, y: 0.15 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 0.85 },
    ];
  }
  ctx.drawImage(source, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;

  let minX = sw;
  let maxX = 0;
  let minY = sh;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = (y * sw + x) * 4;
      if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) {
        found = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (!found) {
    return [
      { x: 0.12, y: 0.12 },
      { x: 0.88, y: 0.12 },
      { x: 0.88, y: 0.88 },
      { x: 0.12, y: 0.88 },
    ];
  }

  const pad = Math.max(4, Math.round(Math.min(sw, sh) * 0.02));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(sw - 1, maxX + pad);
  maxY = Math.min(sh - 1, maxY + pad);

  return [
    { x: minX / sw, y: minY / sh },
    { x: maxX / sw, y: minY / sh },
    { x: maxX / sw, y: maxY / sh },
    { x: minX / sw, y: maxY / sh },
  ];
}
