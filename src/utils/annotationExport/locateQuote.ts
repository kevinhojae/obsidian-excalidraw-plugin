/**
 * Text read from the rendered document under a mark, and how far into the document's rendered text
 * (whitespace and markdown symbols removed) that text starts: 0 = beginning, 1 = end.
 */
export type Probe = { text: string; progress: number };

type LineRange = { lineStart: number; lineEnd: number };

/** Characters that rendering may drop or that differ between source and rendered text. */
const SYMBOLS = /[\s*_`~=|#>\\]/g;

/** Turn one source line into the characters its rendered form shows. */
const renderedChars = (line: string): string =>
  line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/, "") // table delimiter row
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(SYMBOLS, "");

/** Rendered text with whitespace and markdown-ish symbols removed; the coordinate space of Probe.progress. */
export const normalizeRenderedText = (text: string): string => text.replace(SYMBOLS, "");

/** Map each source line to the block it belongs to (tables and code fences expand to the whole block). */
const blockRanges = (lines: string[]): LineRange[] => {
  const ranges: LineRange[] = lines.map((_, i) => ({ lineStart: i + 1, lineEnd: i + 1 }));
  const isTable = (l: string) => l.trim().startsWith("|");
  let i = 0;
  while (i < lines.length) {
    const fence = /^\s*(```|~~~)/.exec(lines[i]);
    let j = i;
    if (fence) {
      j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith(fence[1])) j++;
    } else if (isTable(lines[i])) {
      while (j + 1 < lines.length && isTable(lines[j + 1])) j++;
    }
    for (let k = i; k <= Math.min(j, lines.length - 1); k++) {
      ranges[k] = { lineStart: i + 1, lineEnd: Math.min(j, lines.length - 1) + 1 };
    }
    i = j + 1;
  }
  return ranges;
};

const frontmatterEnd = (lines: string[]): number => {
  if (lines[0]?.trim() !== "---") return 0;
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  return close < 0 ? 0 : close + 1;
};

/**
 * A box around a table column reads its cells top to bottom, while the source writes the table row by row,
 * so the text is not contiguous. Accept it when all its words appear in order inside one block.
 */
const findWordsInOneBlock = (
  stream: string,
  lineOfChar: number[],
  blocks: LineRange[],
  probe: Probe,
): { start: number; end: number; dist: number } | null => {
  const words = probe.text.split(/\s+/).map(normalizeRenderedText).filter(Boolean);
  if (words.length < 2) return null;
  let best: { start: number; end: number; dist: number } | null = null;
  for (let at = stream.indexOf(words[0]); at >= 0; at = stream.indexOf(words[0], at + 1)) {
    const blockEnd = blocks[lineOfChar[at]].lineEnd - 1;
    let pos = at + words[0].length;
    let ok = true;
    for (const w of words.slice(1)) {
      const idx = stream.indexOf(w, pos);
      if (idx < 0 || lineOfChar[idx] > blockEnd) {
        ok = false;
        break;
      }
      pos = idx + w.length;
    }
    if (!ok) continue;
    const dist = Math.abs(at / Math.max(stream.length, 1) - probe.progress);
    if (!best || dist < best.dist) best = { start: lineOfChar[at], end: lineOfChar[pos - 1], dist };
  }
  return best;
};

/** Find the source lines a probe's text came from. Among repeats, the one closest to progress wins. */
export const locateQuote = (
  source: string,
  probe: Probe,
): { lineStart: number; lineEnd: number; quote: string | null } | null => {
  const needle = normalizeRenderedText(probe.text);
  if (!needle) return null;

  const lines = source.split("\n");
  const blocks = blockRanges(lines);
  const skip = frontmatterEnd(lines);

  // One normalized stream for the whole document, remembering the source line of each char.
  let stream = "";
  const lineOfChar: number[] = [];
  for (let i = skip; i < lines.length; i++) {
    const chars = renderedChars(lines[i]);
    stream += chars;
    for (let k = 0; k < chars.length; k++) lineOfChar.push(i);
  }

  let best: { start: number; end: number; dist: number } | null = null;
  for (let at = stream.indexOf(needle); at >= 0; at = stream.indexOf(needle, at + 1)) {
    const start = lineOfChar[at];
    const end = lineOfChar[at + needle.length - 1];
    const dist = Math.abs(at / Math.max(stream.length, 1) - probe.progress);
    if (!best || dist < best.dist) best = { start, end, dist };
  }
  if (!best) best = findWordsInOneBlock(stream, lineOfChar, blocks, probe);
  if (!best) return null;

  return {
    lineStart: blocks[best.start].lineStart,
    lineEnd: blocks[best.end].lineEnd,
    quote: probe.text.trim().replace(/\s+/g, " "),
  };
};

/** Line range covered by a vertical range mark: from the first probe's line to the last probe's. */
export const locateLineRange = (source: string, probes: Probe[]): LineRange | null => {
  const found = probes.map((p) => locateQuote(source, p)).filter((r) => r !== null);
  if (found.length === 0) return null;
  return {
    lineStart: Math.min(...found.map((r) => r.lineStart)),
    lineEnd: Math.max(...found.map((r) => r.lineEnd)),
  };
};
