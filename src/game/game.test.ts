import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { partyVerdict, tastePercent } from '../multiplayer/personality';

describe('solo taste run', () => {
  it('deals ten unique scenarios with both types and counts personal choices', () => {
    const game = new GameEngine(); game.start();
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      seen.add(game.state.scenario!.id);
      expect(game.state.phase).toBe('playing');
      game.answer('green');
      expect(game.state.feedback).toEqual({ answer: 'green' });
      game.next();
    }
    expect(seen.size).toBe(10);
    expect(game.state).toMatchObject({ phase: 'over', answered: 10, redPicks: 0, greenPicks: 10 });
    expect(game.state.taste).toEqual({ redShown: 5, greenShown: 5, redAccepted: 5, greenAccepted: 5 });
    expect(partyVerdict(game.state.taste).title).toBe('The Red Flag Collector');
  });
  it('all red picks still finish the complete run with a picky verdict', () => {
    const game = new GameEngine(); game.start();
    for (let i = 0; i < 10; i++) { game.answer('red'); game.next(); }
    expect(game.state.phase).toBe('over');
    expect(game.state.taste).toMatchObject({ redAccepted: 0, greenAccepted: 0 });
    expect(partyVerdict(game.state.taste).title).toBe('Hard to Impress');
  });
  it('measures red-flag tolerance separately from green-flag appreciation', () => {
    const game = new GameEngine(); game.start();
    let redSeen = 0;
    for (let i = 0; i < 10; i++) {
      const isRed = game.state.scenario!.answer === 'red';
      if (isRed) redSeen++;
      game.answer(isRed && redSeen > 2 ? 'red' : 'green'); game.next();
    }
    expect(tastePercent(game.state.taste.redAccepted, game.state.taste.redShown)).toBe(40);
    expect(tastePercent(game.state.taste.greenAccepted, game.state.taste.greenShown)).toBe(100);
  });
  it('does not invent answers or change a verdict when the countdown expires', () => {
    const game = new GameEngine(); game.start();
    const card = game.state.scenario;
    game.tick(90000);
    expect(game.state).toMatchObject({ phase: 'playing', answered: 0, remainingMs: 0, feedback: null });
    expect(game.state.scenario).toBe(card);
    expect(game.answer('green')).toBe(true);
    expect(game.state.feedback).toEqual({ answer: 'green' });
  });
  it('locks duplicate inputs, paused input, and premature progression', () => {
    const game = new GameEngine();
    expect(game.answer('red')).toBe(false);
    game.start(); const card = game.state.scenario;
    game.next(); expect(game.state.scenario).toBe(card);
    game.pause(); expect(game.answer('green')).toBe(false);
    game.resume(); game.answer('green');
    expect(game.answer('red')).toBe(false);
    expect(game.state.answered).toBe(1);
    expect(game.state.feedback).toEqual({ answer: 'green' });
    game.pause(); game.next(); expect(game.state.phase).toBe('paused');
    game.resume(); game.next(); expect(game.state.phase).toBe('playing');
  });
  it('pauses timing and resets the whole profile on restart', () => {
    const game = new GameEngine(); game.start(); game.tick(1200); game.pause(); game.tick(90000);
    expect(game.state.remainingMs).toBe(28800);
    game.resume(); game.answer('green'); game.start();
    expect(game.state).toMatchObject({ answered: 0, redPicks: 0, greenPicks: 0, remainingMs: 30000, feedback: null });
    expect(game.state.taste).toEqual({ redShown: 0, greenShown: 0, redAccepted: 0, greenAccepted: 0 });
  });
});
