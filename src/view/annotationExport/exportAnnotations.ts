import { Notice, TFile } from "obsidian";
import type ExcalidrawView from "src/view/ExcalidrawView";
import { classifySelection, expandSelection, type ExcalidrawElementLike } from "src/utils/annotationExport/classifySelection";
import { formatAnnotations } from "src/utils/annotationExport/formatAnnotations";
import { locateLineRange, locateQuote } from "src/utils/annotationExport/locateQuote";
import {
  buildPairingPrompt,
  nearestPairing,
  parsePairingResponse,
  positionMarks,
  stickyGeneralPairings,
  toFeedbackItems,
} from "src/utils/annotationExport/pairing";
import type { Anchor, DocRef, Pairing, Rect } from "src/utils/annotationExport/types";
import { probeMarks } from "./probeAnchors";
import { resolveClaudePath, runClaude } from "./runClaude";

const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Copy the selected docs, marks and comments as plannotator-style feedback to the clipboard. */
export const exportAnnotations = async (view: ExcalidrawView): Promise<void> => {
  const api = view.excalidrawAPI;
  const app = view.app;
  const all = api.getSceneElements() as unknown as ExcalidrawElementLike[];
  // Selecting just a doc (or its frame) is enough: nearby marks and comments are pulled in.
  const selected = expandSelection(view.getViewSelectedElements() as unknown as ExcalidrawElementLike[], all);

  const resolveLink = (link: string): string | null => {
    const m = /^\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]$/.exec(link);
    if (!m || m[1].includes("#")) return null;
    const file = app.metadataCache.getFirstLinkpathDest(m[1], view.file.path);
    return file?.extension === "md" ? file.path : null;
  };

  const { docs, marks, comments, skippedLinks } = classifySelection(selected, all, resolveLink);
  const skippedNote = skippedLinks.length ? `\n건너뜀(부분 링크): ${skippedLinks.join(", ")}` : "";
  if (docs.length === 0 || comments.length === 0) {
    new Notice(`선택에 md 문서와 코멘트가 모두 있어야 해요.${skippedNote}`);
    return;
  }

  const vaultBase = (app.vault.adapter as unknown as { getBasePath?: () => string }).getBasePath?.() ?? "";
  const absolute = (vaultPath: string) => (vaultBase ? `${vaultBase}/${vaultPath}` : vaultPath);
  const sources = new Map<string, string>();
  for (const d of docs) {
    const file = app.vault.getAbstractFileByPath(d.filePath);
    if (file instanceof TFile) sources.set(d.elementId, await app.vault.cachedRead(file));
  }

  // Stickies without arrows are general by convention; only the rest needs pairing.
  const { general, open } = stickyGeneralPairings(comments);
  // A comment also points at the text it was written next to, even when no mark is there.
  const allMarks = [...marks, ...positionMarks(docs, open)];
  const probes = await probeMarks(view, docs, allMarks);

  const anchors: Anchor[] = [];
  for (const mark of allMarks) {
    const doc = docs.find((d) => d.elementId === mark.docId);
    const source = sources.get(mark.docId) ?? "";
    const ps = probes.get(mark.id) ?? [];
    const sceneRatio = (mark.bbox.y - doc.bbox.y) / doc.bbox.height;
    const approxLine = Math.max(1, Math.round(sceneRatio * source.split("\n").length));
    let found: { lineStart: number; lineEnd: number; quote: string | null } | null = null;
    if (mark.kind === "range") {
      const range = locateLineRange(source, ps);
      found = range ? { ...range, quote: ps.map((p) => p.text).join(" … ") } : null;
    } else if (ps[0]) {
      found = locateQuote(source, ps[0]);
    }
    anchors.push({
      id: mark.id,
      filePath: absolute(doc.filePath),
      bbox: mark.bbox,
      ...(mark.kind === "position" ? { positionOf: mark.id.slice("pos:".length) } : {}),
      ...(found ?? { lineStart: approxLine, lineEnd: approxLine, quote: null }),
    });
  }

  let pairings: Pairing[] | null = open.length === 0 ? [] : null;
  let fallbackReason = "";
  const working = open.length ? new Notice("AI가 코멘트를 묶는 중…", 0) : null;
  try {
    const bin = resolveClaudePath(view.plugin.settings.annotationExportClaudePath ?? "");
    const prompt = buildPairingPrompt(anchors, open);
    for (let attempt = 0; attempt < 2 && !pairings; attempt++) {
      const r = await runClaude(bin, prompt);
      if ("reason" in r) {
        fallbackReason = `claude 실행 실패(${r.reason}): ${r.detail}`;
        if (r.reason !== "exit") break;
        continue;
      }
      pairings = parsePairingResponse(r.stdout, anchors, open);
      if (!pairings) fallbackReason = "AI 응답 형식이 맞지 않음";
    }
  } finally {
    working?.hide();
  }
  const usedFallback = !pairings;
  if (usedFallback) pairings = nearestPairing(anchors, open);
  pairings = [...general, ...pairings];

  // General comments go to the nearest doc.
  const nearestDoc = (r: Rect): DocRef => {
    const c = center(r);
    return [...docs].sort(
      (a, b) =>
        Math.hypot(center(a.bbox).x - c.x, center(a.bbox).y - c.y) -
        Math.hypot(center(b.bbox).x - c.x, center(b.bbox).y - c.y),
    )[0];
  };
  const items = pairings.flatMap((p) => {
    const comment = comments.find((c) => c.id === p.commentId);
    return toFeedbackItems([p], anchors, comments, absolute(nearestDoc(comment.bbox).filePath));
  });

  // Electron's clipboard has no focus requirement; navigator.clipboard fails if the user switched apps during the AI wait.
  const electron = (window as unknown as { require?: (id: string) => { clipboard?: { writeText(t: string): void } } }).require?.("electron");
  const text = formatAnnotations(items);
  if (electron?.clipboard) electron.clipboard.writeText(text);
  else await navigator.clipboard.writeText(text);

  const unread = items.filter((i) => i.lineStart !== undefined && i.quote === null).length;
  const unreadNote = unread ? `\n${unread}개는 표시 아래 원문을 읽지 못해 줄 번호가 근사치예요.` : "";
  const fallbackNote = usedFallback ? `\n${fallbackReason} → 가까운 표시 규칙으로 묶었어요.` : "";
  new Notice(`${items.length}개 코멘트를 복사했어요.${unreadNote}${fallbackNote}${skippedNote}`, 8000);
};
