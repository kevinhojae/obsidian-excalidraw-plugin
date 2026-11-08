export type Rect = { x: number; y: number; width: number; height: number };

/** md embeddable on the canvas. filePath is absolute. */
export type DocRef = { elementId: string; filePath: string; bbox: Rect };

/** "position": no mark was drawn; the passage at a comment's own place stands in for one. */
export type MarkKind = "underline" | "box" | "range" | "position";

/** A red mark drawn over a document. */
export type Mark = { id: string; docId: string; kind: MarkKind; bbox: Rect };

/** A mark resolved to source lines. quote is null when the exact substring was not found. */
export type Anchor = {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  quote: string | null;
  bbox: Rect;
  /** Set on a position anchor: the comment whose own place it reads. */
  positionOf?: string;
};

/** sticky: written in a sticky note (or another shape holding the text) rather than as free canvas text. */
export type Comment = { id: string; text: string; bbox: Rect; arrowToIds: string[]; sticky: boolean };

/** anchorIds = [] means general feedback about the document. */
export type Pairing = { commentId: string; anchorIds: string[] };

export type FeedbackItem = {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string | null;
  comment: string;
};
