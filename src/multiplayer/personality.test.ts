import { describe, expect, it } from 'vitest';
import { partyVerdict, tastePercent } from './personality';

describe('party tastes', () => {
  it('uses flags shown as the denominator for every game length', () => {
    expect(tastePercent(10, 15)).toBe(67);
    expect(tastePercent(2, 3)).toBe(67);
    expect(tastePercent(0, 0)).toBeNull();
  });
  it('distinguishes being picky from appreciating healthy behaviour', () => {
    expect(partyVerdict({ redAccepted: 0, redShown: 5, greenAccepted: 0, greenShown: 5 }).title).toBe('Hard to Impress');
    expect(partyVerdict({ redAccepted: 0, redShown: 5, greenAccepted: 5, greenShown: 5 }).title).toBe('The Healthy Relationship Detective');
  });
  it('gives different results for voting patterns without calling people toxic', () => {
    for (let red = 0; red <= 5; red++) {
      const result = partyVerdict({ redAccepted: red, redShown: 5, greenAccepted: 2, greenShown: 5 });
      expect(result.title.length).toBeGreaterThan(3);
      expect(result.line).not.toMatch(/[—–]|--|toxic person/i);
    }
    expect(partyVerdict({ redAccepted: 5, redShown: 5, greenAccepted: 0, greenShown: 5 }).title).toBe('The Red Flag Collector');
    expect(partyVerdict({ redAccepted: 3, redShown: 5, greenAccepted: 0, greenShown: 5 }).title).toBe('I Can Fix Them');
  });
});
