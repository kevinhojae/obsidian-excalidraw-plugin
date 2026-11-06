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
  /** Linear elements: points relative to x,y (x,y is the first point, others may be negative). */
  points?: readonly (readonly [number, number])[];
};

/** A vertical range line may sit this far outside the doc's left/right edge. */
const RANGE_MARGIN = 120;
const UNDERLINE_MAX_HEIGHT = 8;

const bboxOf = (e: ExcalidrawElementLike): Rect => {
  if (e.points?.length) {
    const xs = e.points.map((p) => e.x + p[0]);
    const ys = e.points.map((p) => e.y + p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  return {
    x: Math.min(e.x, e.x + e.width),
    y: Math.min(e.y, e.y + e.height),
    width: Math.abs(e.width),
    height: Math.abs(e.height),
  };
};

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
      // Doc body text lives in the embeddable's DOM, so every canvas text element is a reviewer comment.
      if (!e.containerId) {
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

/** Comments usually sit in the right margin; range lines just left of the text. */
const AUTO_INCLUDE_RIGHT = 600;
const AUTO_INCLUDE_LEFT = RANGE_MARGIN;

/**
 * Grow a selection so that selecting just a doc (or a frame holding it) also takes the marks and comments
 * around it: anything centered within the doc's height and its margins, plus comments joined by arrows.
 */
export const expandSelection = (
  selected: readonly ExcalidrawElementLike[],
  all: readonly ExcalidrawElementLike[],
): ExcalidrawElementLike[] => {
  const live = all.filter((e) => !e.isDeleted && e.type !== "frame");
  const embeddables = live.filter((e) => e.type === "embeddable");
  const docs = selected.filter((e) => e.type === "embeddable" && e.link?.startsWith("[["));
  const picked = new Map(selected.map((e) => [e.id, e]));
  const add = (e: ExcalidrawElementLike | undefined) => e && picked.set(e.id, e);

  for (const d of docs) {
    const box = bboxOf(d);
    const zone = { x: box.x - AUTO_INCLUDE_LEFT, y: box.y, width: box.width + AUTO_INCLUDE_LEFT + AUTO_INCLUDE_RIGHT, height: box.height };
    for (const e of live) {
      if (e.type === "embeddable" || e.containerId) continue;
      const c = center(bboxOf(e));
      const inOtherDoc = embeddables.some((o) => o.id !== d.id && contains(bboxOf(o), c));
      if (contains(zone, c) && !inOtherDoc) add(e);
    }
  }

  // Arrows that touch a picked element bring the element on their other end.
  for (const e of live) {
    if (e.type !== "arrow") continue;
    const ends = [e.startBinding?.elementId, e.endBinding?.elementId];
    if (ends.some((id) => id && picked.has(id) && picked.get(id).type !== "embeddable")) {
      add(e);
      for (const id of ends) add(live.find((x) => x.id === id && x.type !== "embeddable"));
    }
  }

  // Containers bring their bound text.
  for (const e of live) {
    if (e.containerId && picked.has(e.containerId)) add(e);
  }
  return [...picked.values()];
};
