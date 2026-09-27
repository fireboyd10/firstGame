import { describe, expect, it } from 'vitest';
import { scenarios } from './scenarios';

describe('scenario deck', () => {
  it('keeps a large enough deck for repeated sessions without duplicate ids', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(250);
    expect(new Set(scenarios.map((card) => card.id)).size).toBe(scenarios.length);
  });
});
