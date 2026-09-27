import { isNativePlatform } from './platform/native';

/** Updates are offered by the UI only on the menu or results screen. */
export function setupPwa(
  onUpdate: (apply: () => void) => void,
  onOfflineReady?: () => void,
): void {
  // Native releases load their bundled assets and update through the app store.
  if (isNativePlatform() || !import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;

  let applyingUpdate = false;
  let reloading = false;
  let offlineAnnounced = false;
  let offeredWorker: ServiceWorker | null = null;
  const announceOffline = (): void => {
    if (offlineAnnounced) return;
    offlineAnnounced = true;
    onOfflineReady?.();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First install and updates accepted in another tab must not interrupt a run.
    if (applyingUpdate && !reloading) {
      reloading = true;
      window.location.reload();
    }
  });

  const register = async (): Promise<void> => {
    try {
      const base = new URL(import.meta.env.BASE_URL, document.baseURI);
      const registration = await navigator.serviceWorker.register(new URL('service-worker.js', base), {
        scope: base.href,
        updateViaCache: 'none',
      });
      const offerUpdate = (): void => {
        const waiting = registration.waiting;
        if (!waiting || offeredWorker === waiting) return;
        offeredWorker = waiting;
        onUpdate(() => {
          const latest = registration.waiting;
          if (!latest || applyingUpdate) return;
          applyingUpdate = true;
          latest.postMessage({ type: 'SKIP_WAITING' });
        });
      };
      offerUpdate();
      const observed = new Set<ServiceWorker>();
      const watchInstalling = (): void => {
        const worker = registration.installing;
        if (!worker || observed.has(worker)) return;
        observed.add(worker);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed') {
            if (navigator.serviceWorker.controller) offerUpdate();
            else announceOffline();
          }
        });
      };
      watchInstalling();
      registration.addEventListener('updatefound', watchInstalling);
      void navigator.serviceWorker.ready.then(announceOffline).catch(() => undefined);
    } catch {
      // Private modes, insecure hosts, and unsupported browsers still play normally.
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
