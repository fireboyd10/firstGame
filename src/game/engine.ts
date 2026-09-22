import { ScenarioDeck } from './deck';
import { pointsForAnswer } from './scoring';
import { consumeTime, durationForProgress } from './timer';
import type { Answer, GamePhase, GameState } from './types';

const initialState = (): GameState => ({
  phase: 'idle', scenario: null, score: 0, lives: 3, streak: 0, bestStreak: 0,
  answered: 0, correct: 0, remainingMs: 5000, durationMs: 5000, feedback: null,
});

export class GameEngine {
  private current = initialState();
  private readonly deck: ScenarioDeck;
  private pausedPhase: GamePhase = 'playing';

  constructor(random: () => number = Math.random) {
    this.deck = new ScenarioDeck(random);
  }

  get state(): Readonly<GameState> {
    return this.current;
  }

  start(): void {
    this.deck.reset();
    this.current = initialState();
    this.showCard();
  }

  answer(answer: Answer | null): boolean {
    const state = this.current;
    if (state.phase !== 'playing' || !state.scenario) return false;
    // Lock synchronously, before publishing feedback or changing score.
    state.phase = 'feedback';
    const correct = answer === state.scenario.answer;
    state.answered += 1;
    let points = 0;
    if (correct) {
      state.correct += 1;
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      points = pointsForAnswer(state.streak, state.remainingMs, state.durationMs);
      state.score += points;
    } else {
      state.lives -= 1;
      state.streak = 0;
    }
    state.feedback = { correct, answer, explanation: state.scenario.explanation, points };
    return true;
  }

  tick(deltaMs: number): void {
    if (this.current.phase !== 'playing') return;
    this.current.remainingMs = consumeTime(this.current.remainingMs, deltaMs);
    if (this.current.remainingMs === 0) this.answer(null);
  }

  pause(): void {
    if (this.current.phase !== 'playing' && this.current.phase !== 'feedback') return;
    this.pausedPhase = this.current.phase;
    this.current.phase = 'paused';
  }

  resume(): void {
    if (this.current.phase === 'paused') this.current.phase = this.pausedPhase;
  }

  next(): void {
    if (this.current.phase !== 'feedback') return;
    if (this.current.lives === 0) {
      this.current.phase = 'over';
      return;
    }
    this.showCard();
  }

  private showCard(): void {
    this.current.scenario = this.deck.next(this.current.answered);
    this.current.durationMs = durationForProgress(this.current.answered);
    this.current.remainingMs = this.current.durationMs;
    this.current.feedback = null;
    this.current.phase = 'playing';
  }
}
