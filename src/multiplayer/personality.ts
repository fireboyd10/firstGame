export interface PartyTaste {
  redAccepted: number;
  redShown: number;
  greenAccepted: number;
  greenShown: number;
}

export function tastePercent(accepted: number, shown: number): number | null {
  return shown > 0 ? Math.round(Math.max(0, Math.min(shown, accepted)) / shown * 100) : null;
}

export function partyVerdict(taste: PartyTaste): { title: string; line: string } {
  const red = tastePercent(taste.redAccepted, taste.redShown);
  const green = tastePercent(taste.greenAccepted, taste.greenShown);
  if (red === null) return { title: 'Still a mystery', line: 'Not enough evidence. The group chat will investigate.' };
  if (red >= 80) return { title: 'The Red Flag Collector', line: 'Your friends are already drafting the intervention text.' };
  if (red >= 50 && (green ?? 0) < 50) return { title: 'I Can Fix Them', line: 'Nice people bore you. A project? Now we are talking.' };
  if (red >= 50) return { title: 'Here for the Drama', line: 'You know better. You just want to see what happens.' };
  if (red >= 20) return { title: 'One More Chance', line: 'You said never again. Then they texted.' };
  if ((green ?? 0) < 50) return { title: 'Hard to Impress', line: 'At this rate, nobody is making it past the talking stage.' };
  return { title: 'The Healthy Relationship Detective', line: 'You have standards, and the group chat has your number.' };
}
