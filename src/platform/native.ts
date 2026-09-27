import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

interface NativeLifecycle {
  onActiveChange: (active: boolean) => void;
  onBackButton: () => void;
}

/** Native pause complements document visibility; returning never resumes a run. */
export async function setupNativeLifecycle(callbacks: NativeLifecycle): Promise<void> {
  if (!isNativePlatform()) return;

  let receivedStateEvent = false;
  const updateState = (active: boolean): void => {
    receivedStateEvent = true;
    callbacks.onActiveChange(active);
  };
  try {
    await Promise.allSettled([
      App.addListener('appStateChange', ({ isActive }) => updateState(isActive)),
      App.addListener('pause', () => updateState(false)),
      ...(Capacitor.getPlatform() === 'android'
        ? [App.addListener('backButton', callbacks.onBackButton)]
        : []),
    ]);
    const { isActive } = await App.getState();
    // A delayed initial snapshot must not override a newer background event.
    if (!receivedStateEvent) callbacks.onActiveChange(isActive);
  } catch { /* Missing native plugins leave browser visibility as the fallback. */ }
}

export async function minimizeNativeApp(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try { await App.minimizeApp(); } catch { /* Minimize is optional. */ }
}
