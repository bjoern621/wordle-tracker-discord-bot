// The classic emoji share block, plus whichever overlays the view carries. The
// header stays outside the spoiler so the post is identifiable; the grid and any
// revealed answer go inside it when spoiler wrapping is on.

import type { ShareView } from './share-model.js';

const EMOJI: Record<string, string> = { B: '⬛', Y: '\u{1f7e8}', G: '\u{1f7e9}' };

function emojiRow(pattern: string): string {
  return [...pattern].map((c) => EMOJI[c] ?? EMOJI.B).join('');
}

export function buildShareText(view: ShareView): string {
  const header = `Wordle ${view.numberLabel} ${view.score}${view.hardMode ? '*' : ''}`;

  const body: string[] = [];
  for (const r of view.rows) {
    const extras: string[] = [];
    if (r.word) extras.push(r.word);
    if (r.wordsLeft != null) extras.push(`${r.wordsLeft} left`);
    body.push(extras.length ? `${emojiRow(r.pattern)}  ${extras.join('  ')}` : emojiRow(r.pattern));
  }

  const footer: string[] = [];
  if (view.nextGuess) footer.push(`Next best guess: ${view.nextGuess}`);
  if (view.answer) footer.push(`Answer: ${view.answer}`);
  if (view.opener != null) footer.push(`Opener: ${view.opener}/5 found`);
  if (view.time) footer.push(`Time: ${view.time}`);
  if (footer.length) body.push('', ...footer);

  let block = body.join('\n');
  if (view.spoiler && block) block = `||${block}||`;

  // Notes sit outside the spoiler: they explain what is missing, nothing to hide.
  const lines = [header];
  if (block) lines.push('', block);
  if (view.notes.length) lines.push('', ...view.notes.map((n) => `_${n}_`));
  return lines.join('\n');
}
