const MAX_BASENAME_LENGTH = 60;

/**
 * The basename (without extension) for a note holding pasted markdown: its
 * first line of content, stripped of markdown markers and of characters that
 * are unsafe in filenames or wikilinks.
 */
export function getMarkdownCardBasename(markdown: string): string {
  const body = markdown.replace(
    /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/,
    "",
  );
  const firstLine =
    body.split(/\r?\n/).find((line) => /[^\s#>*`~_=-]/.test(line)) ?? "";
  return firstLine
    .replace(/^[\s#>*+-]+/, "")
    .replace(/[\\/:*?"<>|#^[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_BASENAME_LENGTH)
    .trim();
}
