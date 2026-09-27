import type { Scenario } from '../game/types';

export const scenarios: readonly Scenario[] = (await import('./scenario-bank.js')).scenarios as readonly Scenario[];
