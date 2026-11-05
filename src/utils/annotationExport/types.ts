export type Rect = { x: number; y: number; width: number; height: number };

/** md embeddable on the canvas. filePath is absolute. */
export type DocRef = { elementId: string; filePath: string; bbox: Rect };

export type MarkKind = "underline" | "box" | "range";

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
};

export type Comment = { id: string; text: string; bbox: Rect; arrowToIds: string[] };

/** anchorIds = [] means general feedback about the document. */
export type Pairing = { commentId: string; anchorIds: string[] };

export type FeedbackItem = {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  quote?: string | null;
  comment: string;
};
