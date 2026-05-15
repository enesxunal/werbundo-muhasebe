/** Canvas'ı 90° döndürür */
export function rotateCanvas90(
  source: HTMLCanvasElement,
  direction: "cw" | "ccw" = "cw",
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext("2d");
  if (!ctx) return source;

  const rad = direction === "cw" ? Math.PI / 2 : -Math.PI / 2;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

/** Fişler genelde dikey; yatay çıktıysa dik konuma getir */
export function orientReceiptPortrait(canvas: HTMLCanvasElement): HTMLCanvasElement {
  if (canvas.width <= canvas.height * 1.08) return canvas;
  return rotateCanvas90(canvas, "ccw");
}
