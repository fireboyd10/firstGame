import { describe, expect, it } from 'vitest';
import { scenarios } from '../data/scenarios';
import { difficultyForProgress, ScenarioDeck } from './deck';
import { GameEngine } from './engine';
import { accuracyPercent, betterHighScore, multiplierForStreak, pointsForAnswer } from './scoring';
import { consumeTime, durationForProgress } from './timer';

describe('scenario content and shuffled selection', () => {
  it('ships 60 unique, complete cards with both answers at each difficulty', () => {
    expect(scenarios).toHaveLength(60);
    expect(new Set(scenarios.map((card) => card.id)).size).toBe(60);
    for (const difficulty of [1, 2, 3]) {
      const cards = scenarios.filter((card) => card.difficulty === difficulty);
      expect(cards).toHaveLength(20);
      expect(cards.some((card) => card.answer === 'red')).toBe(true);
      expect(cards.some((card) => card.answer === 'green')).toBe(true);
    }
    for (const card of scenarios) {
      expect(card.text.length).toBeGreaterThan(15);
      expect(card.explanation.length).toBeGreaterThan(15);
      expect(card.category.length).toBeGreaterThan(0);
    }
  });

  it('uses every eligible card before repeating and protects the cycle boundary', () => {
    const deck = new ScenarioDeck(() => 0.999);
    let previous = '';
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const seen = new Set<string>();
      for (let card = 0; card < 60; card += 1) {
        const current = deck.next(20);
        expect(current.id).not.toBe(previous);
        expect(seen.has(current.id)).toBe(false);
        seen.add(current.id);
        previous = current.id;
      }
    }
  });

  it('avoids an immediate repeat on restart and when unlocking a difficulty', () => {
    const deck = new ScenarioDeck(() => 0);
    const first = deck.next(0);
    deck.reset();
    const second = deck.next(0);
    expect(second.id).not.toBe(first.id);
    expect(deck.next(6).id).not.toBe(second.id);
  });

  it('only draws unlocked difficulties', () => {
    const deck = new ScenarioDeck(() => 0.3);
    for (const progress of [0, 5, 6, 13, 14, 50]) {
      for (let draw = 0; draw < 70; draw += 1) {
        expect(deck.next(progress).difficulty).toBeLessThanOrEqual(difficultyForProgress(progress));
      }
    }
    expect([0, 5, 6, 13, 14].map(difficultyForProgress)).toEqual([1, 1, 2, 2, 3]);
  });
});

describe('scoring', () => {
  it('awards base points, a bounded speed bonus, and the current streak multiplier', () => {
    expect(pointsForAnswer(1, 2500, 5000)).toBe(125);
    expect(pointsForAnswer(5, 2500, 5000)).toBe(250);
    expect(pointsForAnswer(10, 0, 5000)).toBe(300);
    expect(pointsForAnswer(15, 10000, 5000)).toBe(600);
    expect(pointsForAnswer(1, -10, 5000)).toBe(100);
  });

  it('increases the multiplier at each five-answer milestone and caps at four', () => {
    expect([0, 1, 4, 5, 9, 10, 14, 15, 100].map(multiplierForStreak))
      .toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('retains only a valid highest score', () => {
    expect(betterHighScore(900, 600)).toBe(900);
    expect(betterHighScore(900, 1200)).toBe(1200);
    expect(betterHighScore(900, 900)).toBe(900);
    expect(betterHighScore(Number.NaN, 150)).toBe(150);
    expect(betterHighScore(-20, Number.POSITIVE_INFINITY)).toBe(0);
    expect(betterHighScore(150.7, 120)).toBe(150);
  });

  it('handles accuracy before and after a run', () => {
    expect(accuracyPercent(0, 0)).toBe(0);
    expect(accuracyPercent(2, 3)).toBe(67);
    expect(accuracyPercent(5, 5)).toBe(100);
  });
});

describe('timing', () => {
  it('ramps from five seconds down to a fixed 2.8-second floor', () => {
    expect(durationForProgress(0)).toBe(5000);
    expect(durationForProgress(10)).toBe(4000);
    expect(durationForProgress(22)).toBe(2800);
    expect(durationForProgress(100)).toBe(2800);
  });

  it('consumes delayed frames fully and rejects invalid elapsed values', () => {
    expect(consumeTime(3000, 2500)).toBe(500);
    expect(consumeTime(3000, 4000)).toBe(0);
    expect(consumeTime(3000, -100)).toBe(3000);
    expect(consumeTime(3000, Number.NaN)).toBe(3000);
  });
});

describe('game engine transitions', () => {
  it('starts with three lives and resets from any phase', () => {
    const game = new GameEngine(() => 0.5);
    expect(game.state.phase).toBe('idle');
    expect(game.answer('red')).toBe(false);
    game.start();
    expect(game.state.phase).toBe('playing');
    expect(game.state.lives).toBe(3);
    expect(game.state.remainingMs).toBe(5000);
    game.answer(game.state.scenario!.answer);
    expect(game.state.score).toBe(150);
    game.pause();
    game.start();
    expect(game.state).toMatchObject({ phase: 'playing', score: 0, streak: 0, bestStreak: 0, answered: 0, correct: 0, lives: 3, feedback: null });
    game.resume();
    expect(game.state.phase).toBe('playing');
  });

  it('builds streaks and speed scores, then loses a life and resets streak on a mistake', () => {
    const game = new GameEngine();
    game.start();
    for (let count = 0; count < 5; count += 1) {
      game.answer(game.state.scenario!.answer);
      game.next();
    }
    expect(game.state).toMatchObject({ score: 900, streak: 5, bestStreak: 5, correct: 5, answered: 5, lives: 3 });
    game.answer(game.state.scenario!.answer === 'red' ? 'green' : 'red');
    expect(game.state).toMatchObject({ score: 900, streak: 0, bestStreak: 5, correct: 5, answered: 6, lives: 2 });
    expect(game.state.feedback).toMatchObject({ correct: false, points: 0 });
  });

  it('expires exactly once, with no score or extra life loss from duplicate input', () => {
    const game = new GameEngine();
    game.start();
    game.tick(4999);
    expect(game.state.phase).toBe('playing');
    expect(game.state.remainingMs).toBe(1);
    game.tick(1);
    expect(game.state).toMatchObject({ phase: 'feedback', lives: 2, score: 0, remainingMs: 0, answered: 1 });
    expect(game.state.feedback).toMatchObject({ correct: false, answer: null });
    expect(game.answer(game.state.scenario!.answer)).toBe(false);
    game.tick(100000);
    expect(game.state.lives).toBe(2);
    expect(game.state.answered).toBe(1);
  });

  it('locks choices and transitions until feedback ends', () => {
    const game = new GameEngine();
    game.start();
    const card = game.state.scenario;
    game.next();
    expect(game.state.scenario).toBe(card);
    expect(game.answer(card!.answer)).toBe(true);
    expect(game.answer(card!.answer)).toBe(false);
    expect(game.state.score).toBe(150);
    game.tick(10000);
    expect(game.state.phase).toBe('feedback');
    game.next();
    const nextCard = game.state.scenario;
    game.next();
    expect(game.state.scenario).toBe(nextCard);
    expect(nextCard).not.toBe(card);
    expect(game.state.durationMs).toBe(4900);
  });

  it('pauses time and input, restoring the phase without consuming hidden time', () => {
    const game = new GameEngine();
    game.start();
    game.tick(800);
    game.pause();
    game.pause();
    game.tick(60000);
    expect(game.answer('red')).toBe(false);
    expect(game.state.remainingMs).toBe(4200);
    game.resume();
    expect(game.state.phase).toBe('playing');
    game.tick(200);
    expect(game.state.remainingMs).toBe(4000);
    game.answer(game.state.scenario!.answer);
    game.pause();
    game.next();
    expect(game.state.phase).toBe('paused');
    game.resume();
    expect(game.state.phase).toBe('feedback');
    game.next();
    expect(game.state.phase).toBe('playing');
  });

  it('ends after three wrong answers, preserves the final explanation, and replays cleanly', () => {
    const game = new GameEngine();
    game.start();
    for (let mistake = 0; mistake < 3; mistake += 1) {
      game.tick(10000);
      expect(game.state.phase).toBe('feedback');
      expect(game.state.feedback?.explanation).toBeTruthy();
      game.next();
    }
    expect(game.state).toMatchObject({ phase: 'over', lives: 0, answered: 3, score: 0 });
    expect(game.answer('green')).toBe(false);
    game.next();
    game.pause();
    game.tick(10000);
    expect(game.state.phase).toBe('over');
    game.start();
    expect(game.state).toMatchObject({ phase: 'playing', lives: 3, answered: 0, score: 0, remainingMs: 5000 });
  });
});
