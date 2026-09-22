type Cue = 'correct' | 'incorrect' | 'streak' | 'over';
export class Sound {
  private context: AudioContext | null = null;
  muted = false;
  unlock(): void {
    if (this.muted) return;
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      this.context ??= new Audio();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Audio is an optional enhancement. */ }
  }
  play(cue: Cue): void {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const notes: Record<Cue, number[]> = { correct: [523, 784], incorrect: [196, 147], streak: [523, 659, 784, 1047], over: [392, 330, 262] };
    try {
      const ctx = this.context;
      notes[cue].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + index * .085;
        oscillator.type = cue === 'incorrect' ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.055, start + .012);
        gain.gain.exponentialRampToValueAtTime(.001, start + .18);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + .2);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch { /* Keep gameplay available on restrictive browsers. */ }
  }
}

export function vibrate(enabled: boolean, correct: boolean): void {
  if (!enabled) return;
  try { navigator.vibrate?.(correct ? 18 : [25, 35, 25]); } catch { /* Unsupported on iOS. */ }
}
