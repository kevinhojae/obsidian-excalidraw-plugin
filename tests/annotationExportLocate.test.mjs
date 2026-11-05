import test from "node:test";
import assert from "node:assert/strict";
import { locateLineRange, locateQuote } from "../src/utils/annotationExport/locateQuote.ts";

const lines = (n, fill = (i) => `filler line ${i}`) =>
  Array.from({ length: n }, (_, i) => fill(i + 1));

test("plain paragraph returns its line and exact substring", () => {
  // Arrange
  const source = ["# Title", "", "첫 문단입니다.", "", "두 번째 문단의 중요한 문장입니다."].join("\n");
  // Act
  const r = locateQuote(source, { text: "중요한 문장", yRatio: 0.9 });
  // Assert
  assert.deepEqual(r, { lineStart: 5, lineEnd: 5, quote: "중요한 문장" });
});

test("rendered text without markdown syntax still matches", () => {
  // Arrange
  const source = ["intro", "", "- **굵은** 문장 [링크](http://x) `코드`", ""].join("\n");
  // Act
  const r = locateQuote(source, { text: "굵은 문장 링크 코드", yRatio: 0.5 });
  // Assert
  assert.deepEqual(r, { lineStart: 3, lineEnd: 3, quote: "굵은 문장 링크 코드" });
});

test("text wrapped across source lines spans both lines", () => {
  // Arrange
  const source = ["앞 문장이 길게", "이어집니다 그리고 끝.", "", "다른 문단"].join("\n");
  // Act
  const r = locateQuote(source, { text: "길게 이어집니다", yRatio: 0.1 });
  // Assert
  assert.deepEqual(r, { lineStart: 1, lineEnd: 2, quote: "길게 이어집니다" });
});

test("duplicate text resolves by y-order hint", () => {
  // Arrange
  const src = lines(100);
  src[9] = "반복되는 문장";
  src[89] = "반복되는 문장";
  const source = src.join("\n");
  // Act
  const low = locateQuote(source, { text: "반복되는 문장", yRatio: 0.88 });
  const high = locateQuote(source, { text: "반복되는 문장", yRatio: 0.12 });
  // Assert
  assert.equal(low.lineStart, 90);
  assert.equal(high.lineStart, 10);
});

test("table cell maps to whole table range", () => {
  // Arrange
  const src = lines(130);
  src[106] = "| 항목 | Core | Talk |";
  src[107] = "|---|---|---|";
  for (let i = 108; i <= 124; i++) src[i] = `| 행${i} | 값 | 값 |`;
  src[115] = "| 수신 거부 | 없음 | 새것 |";
  const source = src.join("\n");
  // Act
  const r = locateQuote(source, { text: "없음", yRatio: 0.85 });
  // Assert
  assert.deepEqual(r, { lineStart: 107, lineEnd: 125, quote: "없음" });
});

test("frontmatter counts toward line numbers", () => {
  // Arrange
  const source = ["---", "title: x", "---", "", "본문 문장"].join("\n");
  // Act
  const r = locateQuote(source, { text: "본문 문장", yRatio: 0.5 });
  // Assert
  assert.equal(r.lineStart, 5);
});

test("no match returns null", () => {
  // Arrange
  const source = "hello";
  // Act
  const r = locateQuote(source, { text: "없는 문장", yRatio: 0.5 });
  // Assert
  assert.equal(r, null);
});

test("range probes span first to last line", () => {
  // Arrange
  const source = lines(50).join("\n");
  // Act
  const r = locateLineRange(source, [
    { text: "filler line 12", yRatio: 0.24 },
    { text: "filler line 20", yRatio: 0.4 },
  ]);
  // Assert
  assert.deepEqual(r, { lineStart: 12, lineEnd: 20 });
});
