import test from "node:test";
import assert from "node:assert/strict";
import { formatAnnotations } from "../src/utils/annotationExport/formatAnnotations.ts";

test("single file renders plannotator header and footer", () => {
  // Arrange
  const items = [
    { filePath: "/a.md", lineStart: 3, lineEnd: 3, quote: "x", comment: "c1" },
    { filePath: "/a.md", comment: "c2" },
  ];
  // Act
  const out = formatAnnotations(items);
  // Assert
  assert.ok(out.startsWith("# Markdown Annotations\n\nFile: /a.md\n"));
  assert.ok(out.includes("I've reviewed this document and have 2 pieces of feedback:"));
  assert.ok(out.endsWith("---\n\nPlease address the annotation feedback above.\n"));
});

test("general comes first, then by lineStart", () => {
  // Arrange
  const items = [
    { filePath: "/a.md", lineStart: 107, lineEnd: 125, quote: "없음", comment: "c3" },
    { filePath: "/a.md", lineStart: 103, lineEnd: 103, quote: "1-6 Core와 비교", comment: "c2" },
    { filePath: "/a.md", comment: "c1" },
  ];
  // Act
  const out = formatAnnotations(items);
  // Assert
  const i1 = out.indexOf("### 1. General feedback about the document\n> c1");
  const i2 = out.indexOf('### 2. (line 103) Feedback on: "1-6 Core와 비교"\n> c2');
  const i3 = out.indexOf('### 3. (lines 107–125) Feedback on: "없음"\n> c3');
  assert.ok(i1 >= 0 && i2 > i1 && i3 > i2, out);
});

test("comment lines are blockquoted", () => {
  // Arrange
  const items = [{ filePath: "/a.md", comment: "a\nb" }];
  // Act
  const out = formatAnnotations(items);
  // Assert
  assert.ok(out.includes("> a\n> b\n"), out);
});

test("multiple files use folder format with per-file numbering", () => {
  // Arrange
  const items = [
    { filePath: "/b.md", lineStart: 1, lineEnd: 1, quote: "q", comment: "b1" },
    { filePath: "/a.md", lineStart: 1, lineEnd: 1, quote: "q", comment: "a1" },
    { filePath: "/a.md", lineStart: 2, lineEnd: 2, quote: "q", comment: "a2" },
  ];
  // Act
  const out = formatAnnotations(items);
  // Assert
  assert.ok(out.startsWith("# Markdown Annotations\n\n# Folder Document Feedback\n"));
  assert.ok(out.includes("grouped by file."));
  const a = out.indexOf("## /a.md");
  const b = out.indexOf("## /b.md");
  assert.ok(a > 0 && b > 0);
  assert.ok(out.includes("## /a.md\n\nI've reviewed this document and have 2 pieces of feedback:\n\n### 1."));
  assert.ok(out.includes("## /b.md\n\nI've reviewed this document and have 1 pieces of feedback:\n\n### 1."));
  assert.equal(out.split("Please address the annotation feedback above.").length, 2);
  assert.ok(!out.includes("\nFile: "));
});

test("quote with quotes and newlines stays on one header line", () => {
  // Arrange
  const items = [{ filePath: "/a.md", lineStart: 4, lineEnd: 5, quote: 'say "hi"\nnext', comment: "c" }];
  // Act
  const out = formatAnnotations(items);
  // Assert
  assert.ok(out.includes('### 1. (lines 4–5) Feedback on: "say "hi" next"\n> c'), out);
});

test("null quote with lines renders lines only", () => {
  // Arrange
  const items = [{ filePath: "/a.md", lineStart: 5, lineEnd: 5, quote: null, comment: "c" }];
  // Act
  const out = formatAnnotations(items);
  // Assert
  assert.ok(out.includes("### 1. (line 5) Feedback on: (원문 위치 불확실)\n> c"), out);
});
