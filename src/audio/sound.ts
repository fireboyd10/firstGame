type Cue = 'pick' | 'reveal' | 'finish';
type Voice = { oscillator: OscillatorNode; gain: GainNode; countdown: boolean };

/** Original, quiet game-show tones, synthesized locally without media downloads. */
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
  private tone(frequency: number, delay: number, duration: number, volume: number, countdown = false): void {
    if (this.muted || !this.active || !this.context || this.context.state !== 'running') return;
    try {
      const ctx = this.context;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const voice = { oscillator, gain, countdown };
      const start = ctx.currentTime + delay;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + duration);
      oscillator.connect(gain).connect(ctx.destination);
      this.voices.add(voice);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      oscillator.start(start);
      oscillator.stop(start + duration + .01);
    } catch { /* Audio failures never interrupt a vote. */ }
  }
  play(cue: Cue): void {
    const notes: Record<Cue, number[]> = { pick: [392, 523], reveal: [392, 523, 659], finish: [523, 659, 784, 1047] };
    notes[cue].forEach((frequency, index) => this.tone(frequency, index * .09, .16, .035));
  }
  countdown(round: string, remainingMs: number): void {
    if (remainingMs <= 0 || !Number.isFinite(remainingMs) || this.muted || !this.active) { this.stopCountdown(); return; }
    const interval = remainingMs <= 5000 ? 250 : remainingMs <= 10000 ? 500 : 1000;
    const step = Math.floor(remainingMs / interval);
    const beat = `${round}:${interval}:${step}`;
    if (beat === this.beat) return;
    this.beat = beat;
    // Four plucky notes, with a faster, higher tick near the end. No answer cues.
    const frequency = [330, 392, 440, 392][step % 4]! * (remainingMs <= 5000 ? 2 : 1);
    this.tone(frequency, 0, .065, .018, true);
    if (interval === 1000) this.tone(165, .08, .07, .01, true);
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
