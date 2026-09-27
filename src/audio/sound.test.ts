import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Sound } from './sound';

const oscillator = () => ({ frequency: { value: 0 }, type: '', connect: vi.fn((target: unknown) => target), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null });
let voices: ReturnType<typeof oscillator>[];
let contexts: number;
class FakeAudio {
  currentTime = 0; state = 'running'; destination = {};
  constructor() { contexts++; }
  resume() { return Promise.resolve(); }
  createOscillator() { const voice = oscillator(); voices.push(voice); return voice; }
  createGain() { return { gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }; }
}
beforeEach(() => { contexts = 0; voices = []; vi.stubGlobal('window', { AudioContext: FakeAudio }); });
afterEach(() => vi.unstubAllGlobals());

describe('round sound', () => {
  it('waits for a gesture to unlock audio and does not stack ticks on repeated frames', () => {
    const sound = new Sound(); sound.countdown('one', 30000);
    expect(contexts).toBe(0); expect(voices).toHaveLength(0);
    sound.unlock(); sound.countdown('one', 29500);
    const count = voices.length;
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) sound.countdown('one', 29400);
    expect(voices).toHaveLength(count);
    sound.countdown('one', 28400); expect(voices.length).toBeGreaterThan(count);
  });
  it('accelerates in the last five seconds and stops at zero', () => {
    const sound = new Sound(); sound.unlock();
    sound.countdown('one', 4750); const count = voices.length;
    sound.countdown('one', 4500); expect(voices.length).toBe(count + 1);
    sound.countdown('one', 0);
    for (const voice of voices) expect(voice.disconnect).toHaveBeenCalled();
  });
  it('cancels scheduled ticks and chimes on mute or backgrounding', () => {
    const sound = new Sound(); sound.unlock(); sound.countdown('one', 20000); sound.play('reveal');
    sound.muted = true;
    const count = voices.length;
    for (const voice of voices) expect(voice.stop).toHaveBeenCalledTimes(2);
    sound.countdown('one', 19000); sound.play('finish'); expect(voices).toHaveLength(count);
    sound.muted = false; sound.setActive(false); sound.countdown('one', 18000); expect(voices).toHaveLength(count);
    sound.setActive(true); sound.countdown('one', 17000); expect(voices.length).toBeGreaterThan(count);
  });
  it('stops the countdown without cutting off the neutral reveal chime', () => {
    const sound = new Sound(); sound.unlock(); sound.countdown('one', 12000);
    const ticks = [...voices]; sound.play('reveal'); const cue = voices.slice(ticks.length);
    sound.stopCountdown();
    expect(ticks.every((voice) => voice.disconnect.mock.calls.length > 0)).toBe(true);
    expect(cue.every((voice) => voice.disconnect.mock.calls.length === 0)).toBe(true);
    sound.stop(); expect(cue.every((voice) => voice.disconnect.mock.calls.length > 0)).toBe(true);
  });
  it('keeps the game usable when audio is unavailable or blocked', () => {
    vi.stubGlobal('window', {});
    const sound = new Sound();
    expect(() => { sound.unlock(); sound.countdown('one', 30000); sound.play('pick'); sound.stop(); }).not.toThrow();
  });
});
