import { partyScenarios } from '../data/party-scenarios';
import { consumeTime } from './timer';
import type { Answer, GamePhase, GameState } from './types';

const initialState = (): GameState => ({
  phase: 'idle', scenario: null, totalRounds: 10, answered: 0, redPicks: 0, greenPicks: 0,
  remainingMs: 30000, durationMs: 30000, feedback: null,
  taste: { redShown: 0, greenShown: 0, redAccepted: 0, greenAccepted: 0 },
});

/** Choices build a taste profile. Time and speed never change the verdict. */
export class GameEngine {
  private current = initialState();
  private deck: typeof partyScenarios[number][] = [];
  private pausedPhase: GamePhase = 'playing';

  constructor(private readonly random: () => number = Math.random) {}
  get state(): Readonly<GameState> { return this.current; }

  start(): void {
    const shuffle = <T>(cards: T[]): T[] => {
      for (let i = cards.length - 1; i > 0; i--) {
        const other = Math.floor(this.random() * (i + 1));
        [cards[i], cards[other]] = [cards[other]!, cards[i]!];
      }
      return cards;
    };
    const previous = this.current.scenario?.id;
    this.deck = shuffle((['red', 'green'] as const).flatMap((answer) =>
      shuffle(partyScenarios.filter((card) => card.answer === answer)).slice(0, 5)));
    if (this.deck[0]!.id === previous) [this.deck[0], this.deck[1]] = [this.deck[1]!, this.deck[0]!];
    this.current = initialState();
    this.showCard();
  }

  answer(answer: Answer): boolean {
    const state = this.current;
    if (state.phase !== 'playing' || !state.scenario) return false;
    state.phase = 'feedback';
    state.answered++;
    if (answer === 'red') state.redPicks++;
    else state.greenPicks++;
    if (state.scenario.answer === 'red') {
      state.taste.redShown++;
      if (answer === 'green') state.taste.redAccepted++;
    } else {
      state.taste.greenShown++;
      if (answer === 'green') state.taste.greenAccepted++;
    }
    state.feedback = { answer };
    return true;
  }

  tick(deltaMs: number): void {
    if (this.current.phase === 'playing') this.current.remainingMs = consumeTime(this.current.remainingMs, deltaMs);
    // The countdown adds atmosphere. A player can always take longer to decide.
  }
  pause(): void {
    if (this.current.phase !== 'playing' && this.current.phase !== 'feedback') return;
    this.pausedPhase = this.current.phase;
    this.current.phase = 'paused';
  }
  resume(): void { if (this.current.phase === 'paused') this.current.phase = this.pausedPhase; }
  next(): void {
    if (this.current.phase !== 'feedback') return;
    if (this.current.answered === this.current.totalRounds) { this.current.phase = 'over'; return; }
    this.showCard();
  }
  private showCard(): void {
    this.current.scenario = this.deck[this.current.answered]!;
    this.current.remainingMs = this.current.durationMs;
    this.current.feedback = null;
    this.current.phase = 'playing';
  }
}
