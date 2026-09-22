export type Answer = 'red' | 'green';

export interface Scenario {
  readonly id: string;
  readonly text: string;
  readonly answer: Answer;
  readonly explanation: string;
  readonly difficulty: 1 | 2 | 3;
  readonly category: string;
}

export type GamePhase = 'idle' | 'playing' | 'feedback' | 'paused' | 'over';

export interface Feedback {
  readonly correct: boolean;
  readonly answer: Answer | null;
  readonly explanation: string;
  readonly points: number;
}

export interface GameState {
  phase: GamePhase;
  scenario: Scenario | null;
  score: number;
  lives: number;
  streak: number;
  bestStreak: number;
  answered: number;
  correct: number;
  remainingMs: number;
  durationMs: number;
  feedback: Feedback | null;
}
