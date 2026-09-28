type Cue = 'pick' | 'reveal' | 'finish';
type Voice = { oscillator: OscillatorNode; gain: GainNode; countdown: boolean };

/** Original game-show tones, synthesized locally without media downloads. */
export class Sound {
  private context: AudioContext | null = null;
  private voices = new Set<Voice>();
  private isMuted = false;
  private active = true;
  private beat = '';
  get muted(): boolean { return this.isMuted; }
  set muted(value: boolean) { this.isMuted = value; if (value) this.stop(); }

  setActive(value: boolean): void { this.active = value; if (!value) this.stop(); }
  unlock(): void {
    if (this.muted || !this.active) return;
    try {
      const Audio = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return;
      this.context ??= new Audio();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }
  private tone(frequency: number, delay: number, duration: number, volume: number, countdown = false, type: OscillatorType = 'sine'): void {
    if (this.muted || !this.active || !this.context || this.context.state !== 'running') return;
    try {
      const ctx = this.context;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const voice = { oscillator, gain, countdown };
      const start = ctx.currentTime + delay;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .006);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain).connect(ctx.destination);
      this.voices.add(voice);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      oscillator.start(start);
      oscillator.stop(start + duration + .01);
    } catch { /* Audio failures never interrupt a vote. */ }
  }
  play(cue: Cue): void {
    // Snappy pluck for a pick, rising triad for a reveal, full fanfare + chord for a verdict.
    if (cue === 'pick') {
      this.tone(587, 0, .09, .075, false, 'square');
      this.tone(880, .07, .13, .085, false, 'triangle');
      return;
    }
    if (cue === 'reveal') {
      [392, 523, 659, 784].forEach((frequency, index) => this.tone(frequency, index * .08, .18, .075, false, 'triangle'));
      return;
    }
    [523, 659, 784].forEach((frequency, index) => this.tone(frequency, index * .09, .16, .08, false, 'triangle'));
    [784, 1047, 1319].forEach((frequency) => this.tone(frequency, .3, .38, .07, false, 'triangle')); // victory chord
    this.tone(262, .3, .38, .05, false, 'sine'); // warm low root under the chord
  }
  countdown(round: string, remainingMs: number): void {
    if (remainingMs <= 0 || !Number.isFinite(remainingMs) || this.muted || !this.active) { this.stopCountdown(); return; }
    const interval = remainingMs <= 5000 ? 250 : remainingMs <= 10000 ? 500 : 1000;
    const step = Math.floor(remainingMs / interval);
    const beat = `${round}:${interval}:${step}`;
    if (beat === this.beat) return;
    this.beat = beat;
    // Bright plucky tick, twice as high near the end, with a low heartbeat on slow beats.
    const frequency = [440, 523, 587, 523][step % 4]! * (remainingMs <= 5000 ? 2 : 1);
    this.tone(frequency, 0, .06, .05, true, 'square');
    if (interval === 1000) this.tone(165, .09, .09, .032, true);
  }
  stopCountdown(): void {
    this.beat = '';
    for (const voice of this.voices) if (voice.countdown) this.end(voice);
  }
  stop(): void { this.beat = ''; for (const voice of this.voices) this.end(voice); }
  private end(voice: Voice): void {
    try { voice.gain.gain.value = 0; voice.oscillator.stop(); voice.oscillator.disconnect(); voice.gain.disconnect(); } catch { /* Already ended. */ }
    this.voices.delete(voice);
  }
}

export function vibrate(enabled: boolean): void {
  if (!enabled) return;
  try { navigator.vibrate?.(18); } catch { /* Optional on supported devices. */ }
}
