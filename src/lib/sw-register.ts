// Service Worker registration for Safari Reader Mode.
//
// The SW intercepts /safari-reader/* requests and returns pre-rendered
// HTML directly in the network response — this is what triggers Safari's
// Reader Mode (Aa icon) because the article content is present in the
// initial network stream, not added later by JavaScript.
//
// We register early (on app load) so the SW is active by the time the
// user taps "Safari Reader". skipWaiting + clientsClaim ensure it takes
// control immediately on first install too.

let readyPromise: Promise<boolean> | null = null;

export function registerSW(): Promise<boolean> {
  if (readyPromise) return readyPromise;

  if (!("serviceWorker" in navigator)) {
    readyPromise = Promise.resolve(false);
    return readyPromise;
  }

  readyPromise = new Promise((resolve) => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // If already active, resolve immediately
        if (reg.active) {
          resolve(true);
          return;
        }
        // Wait for the installing/activating SW to become active
        const sw = reg.installing || reg.waiting;
        if (!sw) {
          resolve(false);
          return;
        }
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") resolve(true);
        });
        // Timeout after 5 seconds — SW may be stuck
        setTimeout(() => resolve(false), 5000);
      })
      .catch(() => {
        resolve(false);
      });
  });

  return readyPromise;
}

export function isSWReady(): boolean {
  return !!(navigator.serviceWorker?.controller);
}

export function postToSW(data: Record<string, unknown>): void {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage(data);
  }
}
