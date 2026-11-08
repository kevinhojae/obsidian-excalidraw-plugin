import type { Anchor, Comment, DocRef, FeedbackItem, Mark, Pairing, Rect } from "./types";

/** Beyond this distance (scene px) the fallback treats a comment as general feedback. */
const NEAR_LIMIT = 400;

const round = (r: Rect) => ({
  x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height),
});

export const buildPairingPrompt = (anchors: Anchor[], comments: Comment[]): string => {
  const input = {
    anchors: anchors.map((a) => ({
      id: a.id, lines: [a.lineStart, a.lineEnd], quote: a.quote, bbox: round(a.bbox),
      ...(a.positionOf ? { positionOf: a.positionOf } : {}),
    })),
    comments: comments.map((c) => ({ id: c.id, text: c.text, bbox: round(c.bbox), arrowTo: c.arrowToIds })),
  };
  return [
    "A reviewer annotated a markdown document on a whiteboard. Anchors are passages they underlined or boxed;",
    "comments are sticky notes or free text they wrote. Coordinates are whiteboard pixels (y grows downward).",
    "Decide which anchor(s) each comment is about.",
    "",
    "Rules:",
    "- If a comment has arrowTo ids, use exactly those anchors.",
    "- Otherwise use position (comments usually sit beside the passage, often to the right at a similar height)",
    "  and meaning (the comment text usually asks about or reacts to the quote).",
    "- An anchor with positionOf was not marked: it is the passage at that comment's own place. Use it only for",
    "  that comment. Prefer a marked anchor when the comment reacts to that quote; use the position anchor when",
    "  no marked anchor fits, e.g. the nearby marks already have their own comments. Use [] only when the comment",
    "  is about the whole document rather than the passage it sits next to.",
    "- A comment may refer to several anchors. A comment that is about the document as a whole gets [].",
    "- Anchors that no comment refers to are simply left out.",
    "- Every comment id must appear exactly once. Use only ids from the input.",
    "",
    'Reply with JSON only, no prose: {"pairings":[{"commentId":"...","anchorIds":["..."]}]}',
    "",
    "Input:",
    JSON.stringify(input, null, 1),
  ].join("\n");
};

const extractJson = (text: string): unknown => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start < 0 || end < start ? null : JSON.parse(body.slice(start, end + 1));
};

/** Parse claude's reply (bare JSON or the --output-format json envelope). Returns null on any contract violation. */
export const parsePairingResponse = (raw: string, anchors: Anchor[], comments: Comment[]): Pairing[] | null => {
  try {
    let data: { result?: unknown; pairings?: unknown } | null;
    try {
      data = JSON.parse(raw);
    } catch {
      data = extractJson(raw) as typeof data;
    }
    if (data && typeof data.result === "string") {
      data = extractJson(data.result) as { pairings?: unknown } | null;
    }
    const list = data?.pairings;
    if (!Array.isArray(list)) return null;

    const anchorIds = new Set(anchors.map((a) => a.id));
    const pairings: Pairing[] = [];
    for (const p of list) {
      if (typeof p?.commentId !== "string" || !Array.isArray(p.anchorIds)) return null;
      if (!p.anchorIds.every((id: unknown) => typeof id === "string" && anchorIds.has(id))) return null;
      pairings.push({ commentId: p.commentId, anchorIds: p.anchorIds });
    }
    const seen = pairings.map((p) => p.commentId);
    const expected = comments.map((c) => c.id);
    if (seen.length !== expected.length || !expected.every((id) => seen.includes(id))) return null;
    return pairings;
  } catch {
    return null;
  }
};

/** Horizontal gaps count a quarter: comments usually sit in the margin beside the passage, at the same height. */
const HORIZONTAL_WEIGHT = 0.25;

const rectDistance = (a: Rect, b: Rect): number => {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return dy + HORIZONTAL_WEIGHT * dx;
};

/** Rule-based pairing used when the AI step fails: arrows first, else the nearest anchor within NEAR_LIMIT. */
export const nearestPairing = (anchors: Anchor[], comments: Comment[]): Pairing[] =>
  comments.map((c) => {
    if (c.arrowToIds.length > 0) return { commentId: c.id, anchorIds: [...c.arrowToIds] };
    let best: { id: string; d: number } | null = null;
    for (const a of anchors) {
      if (a.positionOf) continue;
      const d = rectDistance(a.bbox, c.bbox);
      if (d <= NEAR_LIMIT && (!best || d < best.d)) best = { id: a.id, d };
    }
    // Without a nearby mark, the comment's own place is the best guess.
    const own = anchors.find((a) => a.positionOf === c.id);
    return { commentId: c.id, anchorIds: best ? [best.id] : own ? [own.id] : [] };
  });

/** A comment this far beside a doc (scene px) still reads as written next to that doc's text. */
const BESIDE_DOC = 600;

/**
 * Every comment without an arrow, written on or beside a doc, gets a "position" mark at its own place,
 * so the passage it sits next to can be quoted even when an unrelated mark is close by.
 */
export const positionMarks = (docs: DocRef[], comments: Comment[]): Mark[] =>
  comments.flatMap((c) => {
    if (c.arrowToIds.length > 0) return [];
    const cx = c.bbox.x + c.bbox.width / 2;
    const cy = c.bbox.y + c.bbox.height / 2;
    const doc = docs.find(
      (d) => cy >= d.bbox.y && cy <= d.bbox.y + d.bbox.height &&
        cx >= d.bbox.x - BESIDE_DOC && cx <= d.bbox.x + d.bbox.width + BESIDE_DOC,
    );
    return doc ? [{ id: `pos:${c.id}`, docId: doc.elementId, kind: "position" as const, bbox: c.bbox }] : [];
  });

/** The reviewer's convention: a sticky note is about the whole document unless an arrow ties it to a mark. */
export const stickyGeneralPairings = (comments: Comment[]): { general: Pairing[]; open: Comment[] } => {
  const isGeneral = (c: Comment) => c.sticky && c.arrowToIds.length === 0;
  return {
    general: comments.filter(isGeneral).map((c): Pairing => ({ commentId: c.id, anchorIds: [] })),
    open: comments.filter((c) => !isGeneral(c)),
  };
};

/** Build output items. Quotes and line numbers always come from anchors, never from the AI. */
export const toFeedbackItems = (
  pairings: Pairing[],
  anchors: Anchor[],
  comments: Comment[],
  defaultFilePath: string,
): FeedbackItem[] => {
  const anchorById = new Map(anchors.map((a) => [a.id, a]));
  const commentById = new Map(comments.map((c) => [c.id, c]));
  const items: FeedbackItem[] = [];
  for (const p of pairings) {
    const c = commentById.get(p.commentId);
    if (!c) continue;
    const linked = p.anchorIds
      .map((id) => anchorById.get(id))
      .filter((a): a is Anchor => a !== undefined)
      .sort((a, b) => a.lineStart - b.lineStart);
    if (linked.length === 0) {
      items.push({ filePath: defaultFilePath, comment: c.text });
      continue;
    }
    items.push({
      filePath: linked[0].filePath,
      lineStart: Math.min(...linked.map((a) => a.lineStart)),
      lineEnd: Math.max(...linked.map((a) => a.lineEnd)),
      quote: linked.some((a) => a.quote === null) ? null : linked.map((a) => a.quote).join(" … "),
      comment: c.text,
    });
  }
  return items;
};
