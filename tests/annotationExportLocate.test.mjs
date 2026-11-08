import test from "node:test";
import assert from "node:assert/strict";
import { locateLineRange, locateQuote } from "../src/utils/annotationExport/locateQuote.ts";

const lines = (n, fill = (i) => `filler line ${i}`) =>
  Array.from({ length: n }, (_, i) => fill(i + 1));

test("plain paragraph returns its line and exact substring", () => {
  // Arrange
  const source = ["# Title", "", "첫 문단입니다.", "", "두 번째 문단의 중요한 문장입니다."].join("\n");
  // Act
  const r = locateQuote(source, { text: "중요한 문장", progress: 0.9 });
  // Assert
  assert.deepEqual(r, { lineStart: 5, lineEnd: 5, quote: "중요한 문장" });
});

test("rendered text without markdown syntax still matches", () => {
  // Arrange
  const source = ["intro", "", "- **굵은** 문장 [링크](http://x) `코드`", ""].join("\n");
  // Act
  const r = locateQuote(source, { text: "굵은 문장 링크 코드", progress: 0.5 });
  // Assert
  assert.deepEqual(r, { lineStart: 3, lineEnd: 3, quote: "굵은 문장 링크 코드" });
});

test("text wrapped across source lines spans both lines", () => {
  // Arrange
  const source = ["앞 문장이 길게", "이어집니다 그리고 끝.", "", "다른 문단"].join("\n");
  // Act
  const r = locateQuote(source, { text: "길게 이어집니다", progress: 0.1 });
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
  const low = locateQuote(source, { text: "반복되는 문장", progress: 0.88 });
  const high = locateQuote(source, { text: "반복되는 문장", progress: 0.12 });
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
  const r = locateQuote(source, { text: "없음", progress: 0.85 });
  // Assert
  assert.deepEqual(r, { lineStart: 107, lineEnd: 125, quote: "없음" });
});

test("frontmatter counts toward line numbers", () => {
  // Arrange
  const source = ["---", "title: x", "---", "", "본문 문장"].join("\n");
  // Act
  const r = locateQuote(source, { text: "본문 문장", progress: 0.5 });
  // Assert
  assert.equal(r.lineStart, 5);
});

test("no match returns null", () => {
  // Arrange
  const source = "hello";
  // Act
  const r = locateQuote(source, { text: "없는 문장", progress: 0.5 });
  // Assert
  assert.equal(r, null);
});

test("range probes span first to last line", () => {
  // Arrange
  const source = lines(50).join("\n");
  // Act
  const r = locateLineRange(source, [
    { text: "filler line 12", progress: 0.24 },
    { text: "filler line 20", progress: 0.4 },
  ]);
  // Assert
  assert.deepEqual(r, { lineStart: 12, lineEnd: 20 });
});

test("duplicate text resolves by text progress, not line fraction", () => {
  // Arrange: many short lines then a few very long ones, so line fraction and text progress disagree.
  const src = ["반복"];
  for (let i = 0; i < 100; i++) src.push("x");
  src.push("반복");
  for (let i = 0; i < 5; i++) src.push("y".repeat(2000));
  const source = src.join("\n");
  // Act: the second occurrence sits ~1% into the rendered text.
  const r = locateQuote(source, { text: "반복", progress: 0.0102 });
  // Assert
  assert.equal(r.lineStart, 102);
});

const columnTable = [
  "### 칸마다 계산",
  "",
  "| 칸 | 과거 3개월 합 | 과거 비율 | 이번 달 계산 |",
  "| --- | --- | --- | --- |",
  "| 한국 · 적어 둠 | 희망 2,000 → 실제 1,600 | **80%** | 희망 500 × 80% = **400** |",
  "| 한국 · 안 적음 | 300건 → 6,000 | **1건당 20** | 60건 × 20 = **1,200** |",
  "| 대만 · 적어 둠 | 0건 | ? | → 아래 1단계 |",
  "",
  "다음 문단에도 과거 비율이 나옵니다.",
].join("\n");

test("boxed table column maps to the whole table even though its cells are not contiguous", () => {
  // Arrange
  const probe = { text: "과거 비율 80% 1건당 20 ?", progress: 0.3 };
  // Act
  const r = locateQuote(columnTable, probe);
  // Assert
  assert.deepEqual(r, { lineStart: 3, lineEnd: 7, quote: "과거 비율 80% 1건당 20 ?" });
});

test("words scattered across different blocks are not stitched together", () => {
  // Arrange: "80%" is only in the table, "다음 문단" only after it.
  const probe = { text: "80% 다음 문단", progress: 0.5 };
  // Act
  const r = locateQuote(columnTable, probe);
  // Assert
  assert.equal(r, null);
});
