import type { Scenario } from './types';
import { scenarios } from '../data/scenarios';

export function difficultyForProgress(answered: number): 1 | 2 | 3 {
  return answered >= 14 ? 3 : answered >= 6 ? 2 : 1;
}

export class ScenarioDeck {
  private bag: Scenario[] = [];
  private lastId: string | null = null;
  private level = 0;

  constructor(private readonly random: () => number = Math.random, private readonly cards = scenarios) {
    if (cards.length === 0) throw new Error('A scenario deck needs at least one card.');
  }

  reset(): void {
    this.bag = [];
    this.level = 0;
    // Keep the last card across restarts to avoid an immediate replay duplicate.
  }

  next(answered: number): Scenario {
    const level = difficultyForProgress(answered);
    if (this.bag.length === 0 || this.level !== level) {
      this.level = level;
      this.bag = this.cards.filter((card) => card.difficulty <= level);
      if (this.bag.length === 0) this.bag = [...this.cards];
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
      }
      if (this.bag.length > 1 && this.bag[this.bag.length - 1]!.id === this.lastId) {
        [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1]!, this.bag[0]!];
      }
    }
    const card = this.bag.pop()!;
    this.lastId = card.id;
    return card;
  }
}
