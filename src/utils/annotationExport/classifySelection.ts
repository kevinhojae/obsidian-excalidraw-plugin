import type { Comment, DocRef, Mark, MarkKind, Rect } from "./types";

/** Only the element fields this module reads. */
export type ExcalidrawElementLike = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  link?: string | null;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  isDeleted?: boolean;
};

/** A vertical range line may sit this far outside the doc's left/right edge. */
const RANGE_MARGIN = 120;
const UNDERLINE_MAX_HEIGHT = 8;

const bboxOf = (e: ExcalidrawElementLike): Rect => ({
  x: Math.min(e.x, e.x + e.width),
  y: Math.min(e.y, e.y + e.height),
  width: Math.abs(e.width),
  height: Math.abs(e.height),
});

const overlaps = (a: Rect, b: Rect, margin = 0): boolean =>
  a.x <= b.x + b.width + margin &&
  b.x - margin <= a.x + a.width &&
  a.y <= b.y + b.height &&
  b.y <= a.y + a.height;

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const contains = (r: Rect, p: { x: number; y: number }, margin = 0): boolean =>
  p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y && p.y <= r.y + r.height;

const markKind = (e: ExcalidrawElementLike, box: Rect): MarkKind | null => {
  if (e.type === "rectangle") {
    return "box";
  }
  if (e.type !== "line") {
    return null;
  }
  if (box.height <= UNDERLINE_MAX_HEIGHT || box.width > box.height * 4) {
    return "underline";
  }
  if (box.width <= UNDERLINE_MAX_HEIGHT || box.height > box.width * 4) {
    return "range";
  }
  return null;
};

export const classifySelection = (
  selected: readonly ExcalidrawElementLike[],
  all: readonly ExcalidrawElementLike[],
  resolveLink: (link: string) => string | null,
): { docs: DocRef[]; marks: Mark[]; comments: Comment[]; skippedLinks: string[] } => {
  const live = selected.filter((e) => !e.isDeleted);
  const docs: DocRef[] = [];
  const skippedLinks: string[] = [];

  for (const e of live) {
    if (e.type !== "embeddable" || !e.link?.startsWith("[[")) {
      continue;
    }
    const filePath = resolveLink(e.link);
    if (filePath) {
      docs.push({ elementId: e.id, filePath, bbox: bboxOf(e) });
    } else if (e.link.includes("#")) {
      skippedLinks.push(e.link);
    }
  }

  const boundTextByContainer = new Map<string, ExcalidrawElementLike>();
  for (const e of all) {
    if (e.type === "text" && e.containerId && !e.isDeleted) {
      boundTextByContainer.set(e.containerId, e);
    }
  }

  const docFor = (box: Rect, margin: number): DocRef | undefined =>
    docs.find((d) => contains(d.bbox, center(box), margin)) ??
    docs.find((d) => overlaps(d.bbox, box, margin));

  const marks: Mark[] = [];
  const comments: Comment[] = [];

  for (const e of live) {
    const box = bboxOf(e);
    const boundText = boundTextByContainer.get(e.id);
    if (boundText && e.type !== "arrow") {
      comments.push({ id: e.id, text: boundText.originalText ?? boundText.text ?? "", bbox: box, arrowToIds: [] });
      continue;
    }
    if (e.type === "text") {
      const insideDoc = docs.some((d) => contains(d.bbox, center(box)));
      if (!e.containerId && !insideDoc) {
        comments.push({ id: e.id, text: e.originalText ?? e.text ?? "", bbox: box, arrowToIds: [] });
      }
      continue;
    }
    const kind = markKind(e, box);
    if (!kind) {
      continue;
    }
    const d = docFor(box, kind === "range" ? RANGE_MARGIN : 0);
    if (d) {
      marks.push({ id: e.id, docId: d.elementId, kind, bbox: box });
    }
  }

  const markIds = new Set(marks.map((m) => m.id));
  for (const e of all) {
    if (e.type !== "arrow" || e.isDeleted) {
      continue;
    }
    const ends = [e.startBinding?.elementId, e.endBinding?.elementId];
    const comment = comments.find((c) => ends.includes(c.id));
    const target = ends.find((id) => id && markIds.has(id));
    if (comment && target && !comment.arrowToIds.includes(target)) {
      comment.arrowToIds.push(target);
    }
  }

  return { docs, marks, comments, skippedLinks };
};
