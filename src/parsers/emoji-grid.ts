// Parses the emoji grid pasted with manual share text into B/Y/G colour rows.

// Standard and high-contrast palettes both map to absent/present/correct.
const SQUARE: Record<string, string> = {
  '🟩': 'G',
  '🟦': 'G', // correct (green / high-contrast blue)
  '🟨': 'Y',
  '🟧': 'Y', // present (yellow / high-contrast orange)
  '⬛': 'B',
  '⬜': 'B', // absent (dark / light)
};

export function parseEmojiGrid(content: string): string[] | null {
  const rows: string[] = [];
  for (const line of content.split('\n')) {
    const cells = Array.from(line)
      .map((ch) => SQUARE[ch])
      .filter(Boolean);
    if (cells.length === 5) rows.push(cells.join(''));
  }
  return rows.length ? rows : null;
}
