import { ensureOpenCvLoaded } from "@/lib/document/loadOpenCv";
import type { OpenCvMat } from "@/lib/document/loadOpenCv";

export type CornerPoints = {
  topLeftCorner: { x: number; y: number };
  topRightCorner: { x: number; y: number };
  bottomLeftCorner: { x: number; y: number };
  bottomRightCorner: { x: number; y: number };
};

export type JScanifyInstance = {
  findPaperContour(mat: OpenCvMat): OpenCvMat;
  getCornerPoints(contour: OpenCvMat): CornerPoints;
  extractPaper(
    image: HTMLImageElement | HTMLCanvasElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: CornerPoints,
  ): HTMLCanvasElement | null;
  highlightPaper?(
    image: HTMLImageElement | HTMLCanvasElement,
    options?: { color?: string; thickness?: number },
  ): HTMLCanvasElement;
};

declare global {
  interface Window {
    jscanify?: new () => JScanifyInstance;
  }
}

let jscanifyReady: Promise<new () => JScanifyInstance> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.jscanify) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Script yüklenemedi: ${src}`));
    document.head.appendChild(script);
  });
}

/** jscanify 1.4 + OpenCV — tarayıcıda (fiş / A4 fark etmez, köşe algılar) */
export async function ensureJscanifyLoaded(): Promise<new () => JScanifyInstance> {
  if (typeof window === "undefined") {
    throw new Error("jscanify yalnızca tarayıcıda yüklenebilir.");
  }
  await ensureOpenCvLoaded();

  if (window.jscanify) return window.jscanify;

  if (!jscanifyReady) {
    jscanifyReady = (async () => {
      await loadScript("https://cdn.jsdelivr.net/gh/ColonelParrot/jscanify@1.4.0/src/jscanify.min.js");
      if (!window.jscanify) throw new Error("jscanify yüklenemedi.");
      return window.jscanify;
    })();
  }

  return jscanifyReady;
}
