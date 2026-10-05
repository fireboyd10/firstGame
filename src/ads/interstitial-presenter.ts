interface ListenerHandle { remove(): Promise<void>; }

export interface InterstitialEvents {
  onDismiss(listener: () => void): Promise<ListenerHandle>;
  onFailure(listener: () => void): Promise<ListenerHandle>;
  show(): Promise<void>;
}

/** The native show promise resolves on presentation; gameplay must wait for dismissal. */
export async function createInterstitialPresenter(events: InterstitialEvents): Promise<() => Promise<void>> {
  let pending: { resolve(): void; reject(error: Error): void } | null = null;
  const finish = (error?: Error): void => {
    const current = pending;
    pending = null;
    if (error) current?.reject(error);
    else current?.resolve();
  };
  const dismissed = await events.onDismiss(() => finish());
  try {
    await events.onFailure(() => finish(new Error('Interstitial could not be shown.')));
  } catch (error) {
    await dismissed.remove();
    throw error;
  }
  return () => {
    if (pending) return Promise.reject(new Error('An interstitial is already showing.'));
    return new Promise<void>((resolve, reject) => {
      const current = { resolve, reject };
      pending = current;
      const failed = (): void => {
        if (pending === current) finish(new Error('Interstitial presentation failed.'));
      };
      try {
        void events.show().catch(failed);
      } catch {
        failed();
      }
    });
  };
}
