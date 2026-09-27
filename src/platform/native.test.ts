import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'web',
  listeners: new Map<string, (...args: never[]) => void>(),
  getState: vi.fn(),
  minimizeApp: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.platform !== 'web',
    getPlatform: () => native.platform,
  },
}));
vi.mock('@capacitor/app', () => ({ App: native }));

import { isNativePlatform, minimizeNativeApp, setupNativeLifecycle } from './native';

beforeEach(() => {
  native.platform = 'web';
  native.listeners.clear();
  native.getState.mockReset().mockResolvedValue({ isActive: true });
  native.minimizeApp.mockReset().mockResolvedValue(undefined);
  native.addListener.mockReset().mockImplementation((event, handler) => {
    native.listeners.set(event, handler);
    return Promise.resolve({ remove: vi.fn() });
  });
});

describe('native lifecycle', () => {
  it('leaves browser lifecycle handling untouched', async () => {
    const onActiveChange = vi.fn();
    await setupNativeLifecycle({ onActiveChange, onBackButton: vi.fn() });
    expect(isNativePlatform()).toBe(false);
    expect(native.addListener).not.toHaveBeenCalled();
    expect(onActiveChange).not.toHaveBeenCalled();
    await minimizeNativeApp();
    expect(native.minimizeApp).not.toHaveBeenCalled();
  });

  it('reports initial state, native background/foreground, and Android back', async () => {
    native.platform = 'android';
    const onActiveChange = vi.fn();
    const onBackButton = vi.fn();
    await setupNativeLifecycle({ onActiveChange, onBackButton });
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    native.listeners.get('pause')?.();
    expect(onActiveChange).toHaveBeenLastCalledWith(false);
    native.listeners.get('appStateChange')?.({ isActive: true } as never);
    expect(onActiveChange).toHaveBeenLastCalledWith(true);
    native.listeners.get('backButton')?.();
    expect(onBackButton).toHaveBeenCalledOnce();
    await minimizeNativeApp();
    expect(native.minimizeApp).toHaveBeenCalledOnce();
  });

  it('does not replace a newer background event with a delayed initial snapshot', async () => {
    native.platform = 'ios';
    let resolveState: (state: { isActive: boolean }) => void = () => {};
    native.getState.mockImplementation(() => new Promise((resolve) => { resolveState = resolve; }));
    const onActiveChange = vi.fn();
    const setup = setupNativeLifecycle({ onActiveChange, onBackButton: vi.fn() });
    await vi.waitFor(() => expect(native.getState).toHaveBeenCalledOnce());
    native.listeners.get('pause')?.();
    resolveState({ isActive: true });
    await setup;
    expect(onActiveChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(native.listeners.has('backButton')).toBe(false);
  });

  it('keeps the app available if plugins are unavailable', async () => {
    native.platform = 'android';
    native.addListener.mockRejectedValue(new Error('unavailable'));
    native.getState.mockRejectedValue(new Error('unavailable'));
    native.minimizeApp.mockRejectedValue(new Error('unavailable'));
    await expect(setupNativeLifecycle({ onActiveChange: vi.fn(), onBackButton: vi.fn() })).resolves.toBeUndefined();
    await expect(minimizeNativeApp()).resolves.toBeUndefined();
  });
});
