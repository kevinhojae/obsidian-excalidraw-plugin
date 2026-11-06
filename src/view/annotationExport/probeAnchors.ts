import type ExcalidrawView from "src/view/ExcalidrawView";
import type { DocRef, Mark, Rect } from "src/utils/annotationExport/types";
import { normalizeRenderedText, type Probe } from "src/utils/annotationExport/locateQuote";

/** Time for an embeddable to mount after it scrolls into view; retried once with the spike-validated 800ms. */
const MOUNT_WAIT_MS = [300, 800];

type Char = { ch: string; node: Text; offset: number; cx: number; cy: number; h: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const intersects = (a: DOMRect, b: { left: number; top: number; right: number; bottom: number }) =>
  a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/**
 * The canvas layer covers embeddables, so hit-testing returns the canvas.
 * Instead, measure each character's client rect and compare with the mark in screen space.
 */
const charsIn = (root: Element, area: { left: number; top: number; right: number; bottom: number }): Char[] => {
  const out: Char[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    range.selectNodeContents(n);
    if (![...range.getClientRects()].some((r) => intersects(r, area))) continue;
    const text = n.textContent ?? "";
    for (let i = 0; i < text.length; i++) {
      range.setStart(n, i);
      range.setEnd(n, i + 1);
      const r = range.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push({ ch: text[i], node: n, offset: i, cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height });
    }
  }
  return out;
};

/** How far into the doc's rendered text a character sits, in the same normalized space locateQuote uses. */
const textProgress = (root: Element, c: Char | undefined): number => {
  if (!c) return 0;
  const before = document.createRange();
  before.setStart(root, 0);
  before.setEnd(c.node, c.offset);
  const total = normalizeRenderedText(root.textContent ?? "").length;
  return total ? normalizeRenderedText(before.toString()).length / total : 0;
};

/** Join characters in document order, with a space between separate text nodes. */
const joinChars = (chars: Char[]): string => {
  let s = "";
  for (let i = 0; i < chars.length; i++) {
    if (i > 0 && chars[i].node !== chars[i - 1].node) s += " ";
    s += chars[i].ch;
  }
  return s.replace(/\s+/g, " ").trim();
};

/** Split characters into visual lines by vertical center. */
const visualLines = (chars: Char[]): Char[][] => {
  const lines: Char[][] = [];
  for (const c of [...chars].sort((a, b) => a.cy - b.cy)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last[0].cy - c.cy) < c.h / 2) last.push(c);
    else lines.push([c]);
  }
  // Restore document order inside each line.
  const order = new Map(chars.map((c, i) => [c, i]));
  return lines.map((l) => l.sort((a, b) => order.get(a) - order.get(b)));
};

export const probeMarks = async (
  view: ExcalidrawView,
  docs: DocRef[],
  marks: Mark[],
): Promise<Map<string, Probe[]>> => {
  const api = view.excalidrawAPI;
  const start = api.getAppState();
  const saved = { scrollX: start.scrollX, scrollY: start.scrollY, zoom: start.zoom };
  const result = new Map<string, Probe[]>();

  const toScreen = (r: Rect) => {
    const st = api.getAppState();
    const z = st.zoom.value;
    return {
      left: (r.x + st.scrollX) * z + st.offsetLeft,
      top: (r.y + st.scrollY) * z + st.offsetTop,
      right: (r.x + r.width + st.scrollX) * z + st.offsetLeft,
      bottom: (r.y + r.height + st.scrollY) * z + st.offsetTop,
    };
  };

  // getEmbeddableLeafElementById can be stale after the view reopens; find the rendered doc by position.
  const docRoot = (doc: DocRef): Element | null => {
    const target = toScreen(doc.bbox);
    return (
      [...view.contentEl.querySelectorAll(".markdown-preview-view")].find((el) =>
        intersects(el.getBoundingClientRect(), target),
      ) ?? null
    );
  };

  try {
    for (const mark of marks) {
      const doc = docs.find((d) => d.elementId === mark.docId);
      if (!doc) continue;

      const st = api.getAppState();
      api.updateScene({
        appState: {
          zoom: { value: 1 as never },
          scrollX: st.width / 2 - (mark.bbox.x + mark.bbox.width / 2),
          scrollY: st.height / 2 - (mark.bbox.y + Math.min(mark.bbox.height, st.height / 2) / 2),
        },
      });
      let root: Element | null = null;
      for (const wait of MOUNT_WAIT_MS) {
        await sleep(wait);
        root = docRoot(doc);
        if (root) break;
      }
      if (!root) continue;
      const m = toScreen(mark.bbox);
      const docScreen = toScreen(doc.bbox);

      if (mark.kind === "underline") {
        // Underlines sit just below the text: take characters centered up to ~one line above the stroke.
        const chars = charsIn(root, { left: m.left, right: m.right, top: m.top - 40, bottom: m.bottom + 10 }).filter(
          (c) => c.cx >= m.left && c.cx <= m.right && c.cy >= m.top - 1.1 * c.h && c.cy <= m.bottom + 0.35 * c.h,
        );
        const text = joinChars(chars);
        if (text) result.set(mark.id, [{ text, progress: textProgress(root, chars[0]) }]);
      } else if (mark.kind === "box") {
        const chars = charsIn(root, m).filter((c) => c.cx >= m.left && c.cx <= m.right && c.cy >= m.top && c.cy <= m.bottom);
        const text = joinChars(chars);
        if (text) result.set(mark.id, [{ text, progress: textProgress(root, chars[0]) }]);
      } else if (mark.kind === "position") {
        // A comment written on or beside the text: take the doc line nearest the comment's top edge.
        const area = { left: docScreen.left, right: docScreen.right, top: m.top - 40, bottom: m.bottom };
        const lines = visualLines(charsIn(root, area).filter((c) => c.cy >= area.top && c.cy <= area.bottom));
        const line = lines.sort((a, b) => Math.abs(a[0].cy - m.top) - Math.abs(b[0].cy - m.top))[0];
        if (line) result.set(mark.id, [{ text: joinChars(line), progress: textProgress(root, line[0]) }]);
      } else {
        // Range: the vertical line sits beside the text; use the full doc width over the line's height.
        const area = { left: docScreen.left, right: docScreen.right, top: m.top, bottom: m.bottom };
        const lines = visualLines(charsIn(root, area).filter((c) => c.cy >= m.top && c.cy <= m.bottom));
        if (lines.length > 0) {
          const last = lines[lines.length - 1];
          result.set(mark.id, [
            { text: joinChars(lines[0]), progress: textProgress(root, lines[0][0]) },
            { text: joinChars(last), progress: textProgress(root, last[0]) },
          ]);
        }
      }
    }
  } finally {
    api.updateScene({ appState: saved });
  }
  return result;
};
