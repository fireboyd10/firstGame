import { describe, expect, it, vi } from 'vitest';
import { createInterstitialPresenter, type InterstitialEvents } from './interstitial-presenter';

function nativeEvents() {
  let dismiss!: () => void;
  let fail!: () => void;
  const events: InterstitialEvents = {
    onDismiss: async callback => { dismiss = callback; return { remove: async () => {} }; },
    onFailure: async callback => { fail = callback; return { remove: async () => {} }; },
    show: vi.fn(async () => {}),
  };
  return { events, dismiss: () => dismiss(), fail: () => fail() };
}

describe('native interstitial completion', () => {
  it('waits for dismissal even when the SDK show call has resolved', async () => {
    const native = nativeEvents();
    const show = await createInterstitialPresenter(native.events);
    let finished = false;
    const showing = show().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    await expect(show()).rejects.toThrow('already showing');
    expect(native.events.show).toHaveBeenCalledTimes(1);
    native.dismiss();
    await showing;
    expect(finished).toBe(true);
  });

  it('unblocks on a native display failure and permits a later presentation', async () => {
    const native = nativeEvents();
    const show = await createInterstitialPresenter(native.events);
    const showing = show();
    native.fail();
    await expect(showing).rejects.toThrow('could not be shown');
    const next = show();
    native.dismiss();
    await expect(next).resolves.toBeUndefined();
  });

  it('unblocks when the native show request rejects', async () => {
    const native = nativeEvents();
    native.events.show = async () => { throw new Error('No prepared ad'); };
    const show = await createInterstitialPresenter(native.events);
    await expect(show()).rejects.toThrow('presentation failed');
  });

  it('ignores a late rejected request from a previously failed presentation', async () => {
    const native = nativeEvents();
    let rejectFirst!: (error: Error) => void;
    native.events.show = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(undefined);
    const show = await createInterstitialPresenter(native.events);
    const first = show();
    native.fail();
    await expect(first).rejects.toThrow('could not be shown');
    let finished = false;
    const next = show().then(() => { finished = true; });
    rejectFirst(new Error('Delayed SDK rejection'));
    await Promise.resolve();
    expect(finished).toBe(false);
    native.dismiss();
    await expect(next).resolves.toBeUndefined();
  });
});
