import test from "node:test";
import assert from "node:assert/strict";
import { classifySelection } from "../src/utils/annotationExport/classifySelection.ts";

const resolveLink = (link) => {
  const m = link.match(/^\[\[([^\]#|]+\.md)\]\]$/);
  return m ? `/vault/${m[1]}` : null;
};
const doc = (id, link = "[[a.md]]") => ({ id, type: "embeddable", x: 0, y: 0, width: 800, height: 2000, link });
const line = (id, x, y, w, h) => ({ id, type: "line", x, y, width: w, height: h });
const run = (selected, all = selected) => classifySelection(selected, all, resolveLink);

test("md embeddable becomes doc, notion embeddable ignored", () => {
  // Arrange
  const els = [doc("d1"), doc("d2", "https://app.notion.com/p/x")];
  // Act
  const r = run(els);
  // Assert
  assert.deepEqual(r.docs, [{ elementId: "d1", filePath: "/vault/a.md", bbox: { x: 0, y: 0, width: 800, height: 2000 } }]);
});

test("subpath link goes to skippedLinks", () => {
  // Arrange
  const els = [doc("d1", "[[a.md#Heading]]")];
  // Act
  const r = run(els);
  // Assert
  assert.deepEqual(r.docs, []);
  assert.deepEqual(r.skippedLinks, ["[[a.md#Heading]]"]);
});

test("horizontal line over doc is underline, vertical is range, rect is box", () => {
  // Arrange
  const els = [
    doc("d1"),
    line("u", 10, 100, 300, 0),
    line("v", 820, 100, 0, 400),
    { id: "b", type: "rectangle", x: 10, y: 300, width: 200, height: 30 },
    line("u2", 10, 500, 300, 4),
  ];
  // Act
  const r = run(els);
  // Assert
  const kinds = Object.fromEntries(r.marks.map((m) => [m.id, m.kind]));
  assert.deepEqual(kinds, { u: "underline", v: "range", b: "box", u2: "underline" });
  assert.ok(r.marks.every((m) => m.docId === "d1"));
});

test("line outside every doc bbox is neither mark nor comment", () => {
  // Arrange
  const els = [doc("d1"), line("far", 5000, 100, 300, 0)];
  // Act
  const r = run(els);
  // Assert
  assert.deepEqual(r.marks, []);
  assert.deepEqual(r.comments, []);
});

test("stickynote text becomes comment with sticky bbox", () => {
  // Arrange
  const sticky = { id: "s", type: "stickynote", x: 900, y: 100, width: 250, height: 120, boundElements: [{ id: "t", type: "text" }] };
  const text = { id: "t", type: "text", x: 920, y: 130, width: 100, height: 25, text: "wrap\nped", originalText: "wrapped", containerId: "s" };
  // Act
  const r = run([doc("d1"), sticky, text]);
  // Assert
  assert.deepEqual(r.comments, [{ id: "s", text: "wrapped", bbox: { x: 900, y: 100, width: 250, height: 120 }, arrowToIds: [] }]);
});

test("free text outside doc is comment, free text inside doc bbox is ignored", () => {
  // Arrange
  const outside = { id: "o", type: "text", x: 900, y: 100, width: 100, height: 25, text: "아주 중요해" };
  const inside = { id: "i", type: "text", x: 100, y: 100, width: 100, height: 25, text: "inside" };
  // Act
  const r = run([doc("d1"), outside, inside]);
  // Assert
  assert.deepEqual(r.comments.map((c) => c.id), ["o"]);
  assert.equal(r.comments[0].text, "아주 중요해");
});

test("arrow from sticky to mark fills arrowToIds", () => {
  // Arrange
  const sticky = { id: "s", type: "stickynote", x: 900, y: 100, width: 250, height: 120 };
  const text = { id: "t", type: "text", x: 920, y: 130, width: 100, height: 25, text: "c", containerId: "s" };
  const u = line("u", 10, 100, 300, 0);
  const fwd = { id: "a1", type: "arrow", x: 900, y: 100, width: 10, height: 10, startBinding: { elementId: "s" }, endBinding: { elementId: "u" } };
  const rev = { id: "a2", type: "arrow", x: 900, y: 100, width: 10, height: 10, startBinding: { elementId: "u" }, endBinding: { elementId: "s" } };
  // Act
  const r1 = run([doc("d1"), sticky, text, u, fwd]);
  const r2 = run([doc("d1"), sticky, text, u, rev]);
  // Assert
  assert.deepEqual(r1.comments[0].arrowToIds, ["u"]);
  assert.deepEqual(r2.comments[0].arrowToIds, ["u"]);
});

test("arrow bound to embeddable is not an anchor link", () => {
  // Arrange
  const sticky = { id: "s", type: "stickynote", x: 900, y: 100, width: 250, height: 120 };
  const text = { id: "t", type: "text", x: 920, y: 130, width: 100, height: 25, text: "c", containerId: "s" };
  const arrow = { id: "a", type: "arrow", x: 900, y: 100, width: 10, height: 10, startBinding: { elementId: "s" }, endBinding: { elementId: "d1" } };
  // Act
  const r = run([doc("d1"), sticky, text, arrow]);
  // Assert
  assert.deepEqual(r.comments[0].arrowToIds, []);
});

test("selected text whose container is selected is not double counted", () => {
  // Arrange
  const sticky = { id: "s", type: "stickynote", x: 900, y: 100, width: 250, height: 120 };
  const text = { id: "t", type: "text", x: 920, y: 130, width: 100, height: 25, text: "c", containerId: "s" };
  // Act
  const r = run([doc("d1"), sticky, text]);
  // Assert
  assert.equal(r.comments.length, 1);
});

test("sticky selected without its text still finds the text in all elements", () => {
  // Arrange
  const sticky = { id: "s", type: "stickynote", x: 900, y: 100, width: 250, height: 120 };
  const text = { id: "t", type: "text", x: 920, y: 130, width: 100, height: 25, text: "c", containerId: "s" };
  // Act
  const r = run([doc("d1"), sticky], [doc("d1"), sticky, text]);
  // Assert
  assert.deepEqual(r.comments.map((c) => c.text), ["c"]);
});

test("line drawn bottom-to-top uses its points for the bbox", () => {
  // Arrange: Excalidraw keeps x,y at the first point; later points can be negative.
  const up = { id: "v", type: "line", x: 820, y: 900, width: 0, height: 400, points: [[0, 0], [0, -400]] };
  // Act
  const r = run([doc("d1"), up]);
  // Assert
  assert.deepEqual(r.marks, [{ id: "v", docId: "d1", kind: "range", bbox: { x: 820, y: 500, width: 0, height: 400 } }]);
});
