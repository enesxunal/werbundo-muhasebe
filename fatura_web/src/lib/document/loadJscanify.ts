import { ensureOpenCvLoaded } from "@/lib/document/loadOpenCv";

export type JScanifyInstance = {
  extractPaper(
    image: HTMLImageElement | HTMLCanvasElement,
    paperWidth: number,
    paperHeight: number,
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

/** jscanify + OpenCV — yalnızca tarayıcıda (npm paketi kullanılmaz) */
export async function ensureJscanifyLoaded(): Promise<new () => JScanifyInstance> {
  if (typeof window === "undefined") {
    throw new Error("jscanify yalnızca tarayıcıda yüklenebilir.");
  }
  await ensureOpenCvLoaded();

  if (window.jscanify) return window.jscanify;

  if (!jscanifyReady) {
    jscanifyReady = (async () => {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jscanify/1.2.0/jscanify.min.js");
      if (!window.jscanify) throw new Error("jscanify yüklenemedi.");
      return window.jscanify;
    })();
  }

  return jscanifyReady;
}
