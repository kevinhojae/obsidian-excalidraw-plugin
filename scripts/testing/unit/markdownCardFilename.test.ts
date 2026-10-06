import assert from "node:assert/strict";
import { test } from "node:test";
import { getMarkdownCardBasename } from "../../../src/utils/markdownCardFilename.ts";

test("uses the first heading, skipping frontmatter", () => {
  // Arrange
  const markdown = "---\ntitle: Ignored\n---\n\n# 첫 번째 섹션\n\nbody";

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename, "첫 번째 섹션");
});

test("uses the first paragraph when there is no heading", () => {
  // Arrange
  const markdown = "\n\n> **quoted** text\nmore";

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename, "quoted text");
});

test("removes characters that break filenames and wikilinks", () => {
  // Arrange
  const markdown = '## a/b: [[link]] #tag | "x"?';

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename, "a b link tag x");
});

test("skips a leading fence line and takes the code's first line", () => {
  // Arrange
  const markdown = "```ts\nconst a = 1;\n```";

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename, "ts");
});

test("caps the length", () => {
  // Arrange
  const markdown = `# ${"가".repeat(200)}`;

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename.length, 60);
});

test("returns an empty string when there is no usable content", () => {
  // Arrange
  const markdown = "---\na: 1\n---\n\n***\n";

  // Act
  const basename = getMarkdownCardBasename(markdown);

  // Assert
  assert.equal(basename, "");
});
