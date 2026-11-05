import type { FeedbackItem } from "./types";

const FOOTER = "---\n\nPlease address the annotation feedback above.\n";
const UNKNOWN_QUOTE = "(원문 위치 불확실)";

const heading = (item: FeedbackItem): string => {
  if (item.lineStart === undefined) {
    return "General feedback about the document";
  }
  const end = item.lineEnd ?? item.lineStart;
  const lines = end === item.lineStart ? `line ${item.lineStart}` : `lines ${item.lineStart}–${end}`;
  const quote = item.quote == null ? UNKNOWN_QUOTE : `"${item.quote.replace(/\s*\n\s*/g, " ")}"`;
  return `(${lines}) Feedback on: ${quote}`;
};

const blockquote = (text: string): string =>
  text.split("\n").map((line) => `> ${line}`).join("\n");

const fileSection = (items: FeedbackItem[]): string => {
  // General first, then by lineStart; stable sort keeps input order for ties.
  const sorted = [...items].sort(
    (a, b) => (a.lineStart ?? -1) - (b.lineStart ?? -1),
  );
  const body = sorted
    .map((item, i) => `### ${i + 1}. ${heading(item)}\n${blockquote(item.comment)}\n`)
    .join("\n");
  return `I've reviewed this document and have ${items.length} pieces of feedback:\n\n${body}`;
};

/** Render feedback in plannotator's "Markdown Annotations" format. */
export const formatAnnotations = (items: FeedbackItem[]): string => {
  const byFile = new Map<string, FeedbackItem[]>();
  for (const item of items) {
    byFile.set(item.filePath, [...(byFile.get(item.filePath) ?? []), item]);
  }
  const files = [...byFile.keys()].sort();

  if (files.length === 1) {
    return `# Markdown Annotations\n\nFile: ${files[0]}\n\n${fileSection(byFile.get(files[0]))}\n${FOOTER}`;
  }
  const sections = files
    .map((file) => `## ${file}\n\n${fileSection(byFile.get(file))}`)
    .join("\n");
  return (
    "# Markdown Annotations\n\n# Folder Document Feedback\n\n" +
    "The following feedback is on files in the reviewed folder, grouped by file.\n\n" +
    `${sections}\n${FOOTER}`
  );
};
