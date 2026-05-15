declare global {
  interface Window {
    cv?: {
      Mat?: unknown;
      onRuntimeInitialized?: () => void;
    };
  }
}

let openCvReady: Promise<void> | null = null;

/** OpenCV.js (jscanify için) — yalnızca tarayıcıda, lazy yükleme */
export function ensureOpenCvLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV yalnızca tarayıcıda yüklenebilir."));
  }
  if (window.cv?.Mat) return Promise.resolve();

  if (!openCvReady) {
    openCvReady = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-opencv="1"]');
      if (existing) {
        const poll = () => {
          if (window.cv?.Mat) resolve();
          else setTimeout(poll, 80);
        };
        poll();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.7.0/opencv.js";
      script.async = true;
      script.dataset.opencv = "1";
      script.onload = () => {
        const wait = () => {
          if (window.cv?.Mat) resolve();
          else setTimeout(wait, 80);
        };
        wait();
      };
      script.onerror = () => reject(new Error("OpenCV yüklenemedi."));
      document.head.appendChild(script);
    });
  }

  return openCvReady;
}
