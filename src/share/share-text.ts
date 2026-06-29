// The classic emoji share block, plus whichever overlays the view carries. The
// header stays outside the spoiler so the post is identifiable; the grid and any
// revealed answer go inside it when spoiler wrapping is on. Notes (why a
// requested overlay is missing) are not part of the share; the command shows
// them to the invoker only, via an ephemeral reply.

import type { ShareView } from './share-model.js';

const EMOJI: Record<string, string> = { B: '⬛', Y: '\u{1f7e8}', G: '\u{1f7e9}' };

function emojiRow(pattern: string): string {
  return [...pattern].map((c) => EMOJI[c] ?? EMOJI.B).join('');
}

export function buildShareText(view: ShareView): string {
  const header = `Wordle ${view.numberLabel} ${view.score}${view.hardMode ? '*' : ''}`;

  // Pad every count to the widest one so the "left" labels line up in a column,
  // flush left under each other. The word and count sit in an inline-code span
  // that Discord renders monospace, which is what keeps the columns aligned; the
  // colour squares stay outside it so they keep rendering as emoji. Every row
  // opens with the same five squares, so each span starts at the same offset.
  const leftWidth = Math.max(0, ...view.rows.map((r) => (r.wordsLeft != null ? String(r.wordsLeft).length : 0)));

  const body: string[] = [];
  for (const r of view.rows) {
    const extras: string[] = [];
    if (r.word) extras.push(r.word);
    if (r.wordsLeft != null) extras.push(`${String(r.wordsLeft).padEnd(leftWidth)} left`);
    body.push(extras.length ? `${emojiRow(r.pattern)}  \`${extras.join('  ')}\`` : emojiRow(r.pattern));
  }

  const footer: string[] = [];
  if (view.nextGuess) footer.push(`Next best guess: ${view.nextGuess}`);
  if (view.answer) footer.push(`Answer: ${view.answer}`);
  if (view.opener != null) footer.push(`Opener: ${view.opener}/5 found`);
  if (view.time) footer.push(`Time: ${view.time}`);
  if (footer.length) body.push('', ...footer);

  let block = body.join('\n');
  if (view.spoiler && block) block = `||${block}||`;

  const lines = [header];
  if (block) lines.push('', block);
  return lines.join('\n');
}
