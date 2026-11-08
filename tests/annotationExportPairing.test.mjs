import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPairingPrompt,
  nearestPairing,
  parsePairingResponse,
  positionMarks,
  stickyGeneralPairings,
  toFeedbackItems,
} from "../src/utils/annotationExport/pairing.ts";

const anchor = (id, y, extra = {}) => ({
  id, filePath: "/a.md", lineStart: y / 10, lineEnd: y / 10, quote: `q-${id}`,
  bbox: { x: 0, y, width: 300, height: 0 }, ...extra,
});
const comment = (id, x, y, extra = {}) => ({
  id, text: `c-${id}`, bbox: { x, y, width: 250, height: 100 }, arrowToIds: [], ...extra,
});

test("prompt contains every id and the JSON contract", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 500)];
  const comments = [comment("C1", 400, 80)];
  // Act
  const p = buildPairingPrompt(anchors, comments);
  // Assert
  for (const s of ["A1", "A2", "C1", "q-A1", "c-C1", '"pairings"', '"commentId"', '"anchorIds"']) {
    assert.ok(p.includes(s), s);
  }
});

test("parse accepts claude --output-format json envelope", () => {
  // Arrange
  const inner = '```json\n{"pairings":[{"commentId":"C1","anchorIds":["A1"]}]}\n```';
  const raw = JSON.stringify({ type: "result", result: inner });
  // Act
  const r = parsePairingResponse(raw, [anchor("A1", 100)], [comment("C1", 400, 80)]);
  // Assert
  assert.deepEqual(r, [{ commentId: "C1", anchorIds: ["A1"] }]);
});

test("parse rejects unknown anchorId or missing commentId", () => {
  // Arrange
  const anchors = [anchor("A1", 100)];
  const comments = [comment("C1", 400, 80), comment("C2", 400, 600)];
  const unknown = '{"pairings":[{"commentId":"C1","anchorIds":["ZZ"]},{"commentId":"C2","anchorIds":[]}]}';
  const missing = '{"pairings":[{"commentId":"C1","anchorIds":["A1"]}]}';
  // Act
  const r1 = parsePairingResponse(unknown, anchors, comments);
  const r2 = parsePairingResponse(missing, anchors, comments);
  // Assert
  assert.equal(r1, null);
  assert.equal(r2, null);
});

test("fallback pairs each comment to nearest anchor", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 1000)];
  const comments = [comment("near1", 350, 60), comment("near2", 350, 980), comment("far", 3000, 3000)];
  // Act
  const r = nearestPairing(anchors, comments);
  // Assert
  assert.deepEqual(r, [
    { commentId: "near1", anchorIds: ["A1"] },
    { commentId: "near2", anchorIds: ["A2"] },
    { commentId: "far", anchorIds: [] },
  ]);
});

test("fallback pairs a margin comment at the same height even when far horizontally", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 1000)];
  const comments = [comment("margin", 900, 60), comment("corner", 1500, -400)];
  // Act
  const r = nearestPairing(anchors, comments);
  // Assert
  assert.deepEqual(r, [
    { commentId: "margin", anchorIds: ["A1"] },
    { commentId: "corner", anchorIds: [] },
  ]);
});

test("fallback respects arrows", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 1000)];
  const comments = [comment("C1", 350, 60, { arrowToIds: ["A2"] })];
  // Act
  const r = nearestPairing(anchors, comments);
  // Assert
  assert.deepEqual(r, [{ commentId: "C1", anchorIds: ["A2"] }]);
});

test("toFeedbackItems drops anchors no comment points to and copies quote/lines from anchors", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 500)];
  const comments = [comment("C1", 400, 80)];
  // Act
  const items = toFeedbackItems([{ commentId: "C1", anchorIds: ["A1"] }], anchors, comments, "/a.md");
  // Assert
  assert.deepEqual(items, [{ filePath: "/a.md", lineStart: 10, lineEnd: 10, quote: "q-A1", comment: "c-C1" }]);
});

test("one comment with two anchors yields merged line range", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 300)];
  const comments = [comment("C1", 400, 80)];
  // Act
  const items = toFeedbackItems([{ commentId: "C1", anchorIds: ["A2", "A1"] }], anchors, comments, "/a.md");
  // Assert
  assert.deepEqual(items, [{ filePath: "/a.md", lineStart: 10, lineEnd: 30, quote: "q-A1 … q-A2", comment: "c-C1" }]);
});

test("general comment uses defaultFilePath", () => {
  // Arrange
  const comments = [comment("C1", 400, 80)];
  // Act
  const items = toFeedbackItems([{ commentId: "C1", anchorIds: [] }], [], comments, "/doc.md");
  // Assert
  assert.deepEqual(items, [{ filePath: "/doc.md", comment: "c-C1" }]);
});

test("merged quote is null when any anchor quote is unknown", () => {
  // Arrange
  const anchors = [anchor("A1", 100), anchor("A2", 300, { quote: null })];
  const comments = [comment("C1", 400, 80)];
  // Act
  const items = toFeedbackItems([{ commentId: "C1", anchorIds: ["A1", "A2"] }], anchors, comments, "/a.md");
  // Assert
  assert.equal(items[0].quote, null);
});

const docRef = { elementId: "d1", filePath: "a.md", bbox: { x: 0, y: 0, width: 800, height: 3000 } };

test("every arrowless comment on or beside a doc gets a position mark, even next to a mark", () => {
  // Arrange: one comment far from marks, one 250px below an unrelated mark, one far off the doc.
  const lone = comment("lone", 200, 1500);
  const near = comment("near", 500, 350);
  const off = comment("off", 5000, 1500);
  // Act
  const r = positionMarks([docRef], [lone, near, off]);
  // Assert
  assert.deepEqual(r.map((m) => m.id), ["pos:lone", "pos:near"]);
  assert.deepEqual(r[0], { id: "pos:lone", docId: "d1", kind: "position", bbox: lone.bbox });
});

test("fallback prefers a nearby marked anchor over the comment's own position", () => {
  // Arrange
  const marked = anchor("u", 100);
  const pos = anchor("pos:C1", 150, { positionOf: "C1" });
  const c1 = comment("C1", 400, 150);
  // Act
  const r = nearestPairing([marked, pos], [c1]);
  // Assert
  assert.deepEqual(r, [{ commentId: "C1", anchorIds: ["u"] }]);
});

test("comment with an arrow gets no position mark", () => {
  // Arrange
  const c = comment("c", 200, 1500, { arrowToIds: ["u"] });
  // Act
  const r = positionMarks([docRef], [c]);
  // Assert
  assert.deepEqual(r, []);
});

test("fallback uses a position anchor only for its own comment", () => {
  // Arrange
  const pos = anchor("pos:C1", 1500, { positionOf: "C1" });
  const c1 = comment("C1", 200, 1500);
  const c2 = comment("C2", 200, 1550);
  // Act
  const r = nearestPairing([pos], [c1, c2]);
  // Assert
  assert.deepEqual(r, [{ commentId: "C1", anchorIds: ["pos:C1"] }, { commentId: "C2", anchorIds: [] }]);
});

test("prompt marks position anchors with their comment", () => {
  // Arrange
  const pos = anchor("pos:C1", 1500, { positionOf: "C1" });
  // Act
  const p = buildPairingPrompt([pos], [comment("C1", 200, 1500)]);
  // Assert
  assert.ok(p.includes('"positionOf": "C1"'));
});

test("stickies without arrows are general; arrowed stickies and free text stay open", () => {
  // Arrange
  const plain = comment("plain", 900, 100, { sticky: true });
  const arrowed = comment("arrowed", 900, 300, { sticky: true, arrowToIds: ["u"] });
  const text = comment("text", 900, 500, { sticky: false });
  // Act
  const r = stickyGeneralPairings([plain, arrowed, text]);
  // Assert
  assert.deepEqual(r.general, [{ commentId: "plain", anchorIds: [] }]);
  assert.deepEqual(r.open.map((c) => c.id), ["arrowed", "text"]);
});
