# Canvas Annotation Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택한 md embeddable과 그 위의 빨간 표시, 스티키/텍스트 코멘트를 plannotator "Markdown Annotations" 형식으로 바꿔 클립보드에 복사하는 Obsidian 명령을 만든다.

**Architecture:** 순수 모듈 4개(분류 · 원문 위치 찾기 · AI 짝짓기 입출력 · 출력 조립)는 Obsidian에 의존하지 않게 만들어 `node --test`로 TDD한다. Obsidian/DOM에 의존하는 부분은 2개다. 표시 아래 텍스트를 읽는 probe와 `claude -p` 실행기다. 이 둘은 테스트 볼트에서 수동으로 검증한다. 명령 하나가 전체를 묶는다.

**Tech Stack:** TypeScript, Obsidian API, Excalidraw 요소 모델(포크, `stickynote` 타입 포함), Node `child_process`, `node:test` + `--experimental-strip-types`

**Spec:** `/Users/hojae/Codes/obsidian-excalidraw-plugin/docs/superpowers/specs/2026-11-05-canvas-annotation-export-design.md`

## Global Constraints

- 범위는 사용자가 선택한 요소만이다. 코멘트가 없는 표시는 출력에서 뺀다. 결과는 클립보드로만 보낸다.
- 표시 = 문서 bbox와 겹치는 `line`(가로=밑줄, 세로=구간), `rectangle`. `freedraw`는 제외한다.
- 코멘트 = `stickynote`가 담은 텍스트(`containerId`) + 컨테이너 없이 문서 bbox **밖**에 있는 `text`
- 링크는 `[[file.md]]` 전체 파일만 다룬다. `#` 서브패스가 있으면 건너뛰고 Notice를 띄운다.
- **AI는 ID만 고른다.** 인용문과 줄 번호는 항상 probe/locate 단계 값으로 채운다.
- 줄 번호는 1부터 센다. frontmatter도 줄 수에 포함한다.
- 내보내는 동안 캔버스 스크롤/줌은 허용한다. 끝나면 원래 `scrollX/scrollY/zoom`으로 되돌린다.
- md가 바뀌어 생기는 드리프트는 처리하지 않는다.
- `claude` 바이너리 경로는 설정값을 쓴다. 기본값은 `~/.local/bin/claude`를 홈 절대경로로 풀어 쓴다. 셸 함수/alias는 거치지 않는다.
- 테스트는 AAA 패턴. 배럴 export는 쓰지 않고 각 모듈을 직접 import한다.
- 출력 형식 문자열(헤더, `I've reviewed this document and have N pieces of feedback:`, `Please address the annotation feedback above.`)은 spec 3절을 그대로 따른다.

## Review Focus

1. **같은 문장이 문서에 여러 번 나오는 경우.** 사람은 자기가 밑줄 친 그 위치의 줄 번호를 기대한다. → Task 3 테스트 `duplicate text resolves by y-order hint`
2. **표 셀 밑줄.** 사람은 표 전체 줄 범위와 셀 텍스트를 기대한다(사용자 예시 `(lines 107–125)`). → Task 3 테스트 `table cell maps to whole table range`
3. **인용문에 `"`·줄바꿈·마크다운 기호가 섞인 경우.** 사람은 헤더 한 줄이 깨지지 않고 원문이 보존되기를 기대한다. → Task 1 테스트 `quote with quotes and newlines stays on one header line`
4. **`claude` 바이너리가 없거나, 시간 초과이거나, JSON이 깨진 경우.** 사람은 그래도 결과(가까운 표시 규칙)가 복사되고, 이유가 Notice로 나오기를 기대한다. → Task 4 테스트 `fallback pairs each comment to nearest anchor`, Task 6 수동 검증
5. **화살표가 표시가 아니라 embeddable 자체나 빈 곳에 묶인 경우.** 사람은 해당 코멘트가 근처 표시나 General로 가기를 기대하고, 크래시가 나지 않기를 기대한다. → Task 2 테스트 `arrow bound to embeddable is not an anchor link`

---

## File Structure

```
src/utils/annotationExport/
  types.ts              공용 타입 (Task 1)
  formatAnnotations.ts  묶음 → plannotator 마크다운 (Task 1)
  classifySelection.ts  선택 요소 → 문서/표시/코멘트 (Task 2)
  locateQuote.ts        읽은 텍스트 + 원본 md → 줄 범위/인용 (Task 3)
  pairing.ts            AI 프롬프트 생성 · 응답 파싱 · 근접 fallback (Task 4)
src/view/annotationExport/
  probeAnchors.ts       뷰 이동 + DOM 탐침 → 읽은 텍스트 (Task 5)
  runClaude.ts          claude -p 실행 (Task 6)
  exportAnnotations.ts  오케스트레이션 (Task 7)
src/core/managers/CommandManager.ts   명령 등록 (Task 7)
src/core/settings*                    claudeBinaryPath 설정 (Task 6)
tests/annotationExport*.test.mjs      순수 모듈 테스트
package.json                          "test:annotation-export" 스크립트 (Task 1)
```

---

### Task 0: 브랜치 + 화면 밖 렌더링 스파이크 (버리는 코드)

**Files:** 없음(스파이크는 테스트 볼트에서 `obsidian vault=excalidraw-test-vault eval code=...`로만 실행)

- [ ] **Step 1:** `update/upstream-2.29.1` 기반으로 `feat/canvas-annotation-export` 브랜치를 만든다. `feat/html-file-embeddable`의 미커밋 변경은 건드리지 않는다. 먼저 `git stash` 여부를 사용자에게 확인한다.
- [ ] **Step 2:** 테스트 볼트에 긴 md(3000줄 이상, 표 포함)를 embeddable로 붙인 보드를 만들고, 맨 아래쪽 문장에 빨간 `line`을 하나 긋는다.
- [ ] **Step 3:** eval로 다음을 확인한다. ① `excalidrawAPI.scrollToContent(lineEl, {fitToViewport:false})` 뒤 `view.getEmbeddableLeafElementById(docId)`가 leaf를 돌려주는가 ② 밑줄 바로 위 화면 좌표의 `document.caretRangeFromPoint(x, y)`가 그 문장 텍스트를 돌려주는가 ③ reading view가 그 section을 렌더링했는가
- [ ] **Step 4:** 결과를 이 plan의 Task 5 상단에 3줄로 기록한다(성공 조건, 필요한 대기 시간 또는 이벤트). 실패하면 멈추고 사용자에게 보고한다. spec 6.2의 위험 항목에 해당한다.

### Task 1: 공용 타입 + 출력 조립

**Files:**
- Create: `src/utils/annotationExport/types.ts`, `src/utils/annotationExport/formatAnnotations.ts`
- Create: `tests/annotationExportFormat.test.mjs`
- Modify: `package.json` scripts에 `"test:annotation-export": "node --experimental-strip-types --test tests/annotationExport*.test.mjs"`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type Rect = { x: number; y: number; width: number; height: number };
  type DocRef = { elementId: string; filePath: string; bbox: Rect };      // filePath = 절대 경로
  type MarkKind = "underline" | "box" | "range";
  type Mark = { id: string; docId: string; kind: MarkKind; bbox: Rect };
  type Anchor = { id: string; filePath: string; lineStart: number; lineEnd: number; quote: string | null; bbox: Rect };
  type Comment = { id: string; text: string; bbox: Rect; arrowToIds: string[] };
  type Pairing = { commentId: string; anchorIds: string[] };              // [] = general
  type FeedbackItem = { filePath: string; lineStart?: number; lineEnd?: number; quote?: string | null; comment: string };
  ```
- Produces: `formatAnnotations(items: FeedbackItem[]): string`

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/annotationExportFormat.test.mjs`)
  - `single file renders plannotator header and footer`: 결과가 `# Markdown Annotations\n\nFile: /a.md\n`로 시작하고, `I've reviewed this document and have 2 pieces of feedback:`를 포함하며, `---\n\nPlease address the annotation feedback above.`로 끝난다.
  - `general comes first, then by lineStart`: 입력 순서와 상관없이 `### 1. General feedback about the document`, `### 2. (line 103) Feedback on: "1-6 Core와 비교"`, `### 3. (lines 107–125) Feedback on: "없음"` 순서다(en dash `–`).
  - `comment lines are blockquoted`: 두 줄 코멘트 `"a\nb"` → `> a\n> b`
  - `multiple files use folder format with per-file numbering`: `# Folder Document Feedback`와 `## /a.md`, `## /b.md`가 있고, 각 파일 첫 항목이 `### 1.`이며, 꼬리말이 한 번만 나온다.
  - `quote with quotes and newlines stays on one header line`: quote `say "hi"\nnext` → 헤더 줄이 `Feedback on: "say "hi" next"`처럼 줄바꿈 없이 한 줄이다(줄바꿈은 공백 하나로).
  - `null quote with lines renders lines only`: `### 1. (line 5) Feedback on: (원문 위치 불확실)` — 이 문구를 고정한다.
- [ ] **Step 2:** `npm run test:annotation-export` → FAIL(모듈 없음)
- [ ] **Step 3:** `types.ts`와 `formatAnnotations` 구현. 같은 `(filePath, lineStart)` 안에서는 입력 순서를 유지한다.
- [ ] **Step 4:** `npm run test:annotation-export` → PASS
- [ ] **Step 5:** 커밋 `feat(annotation-export): plannotator 형식 조립`

### Task 2: 선택 요소 분류

**Files:** Create `src/utils/annotationExport/classifySelection.ts`, `tests/annotationExportClassify.test.mjs`

**Interfaces:**
- Consumes: Task 1 타입
- Produces:
  ```ts
  classifySelection(
    selected: readonly ExcalidrawElementLike[],
    all: readonly ExcalidrawElementLike[],          // containerId·arrow 바인딩 조회용
    resolveLink: (link: string) => string | null,   // [[...]] → 절대 경로, 서브패스·비-md면 null
  ): { docs: DocRef[]; marks: Mark[]; comments: Comment[]; skippedLinks: string[] }
  ```
  `ExcalidrawElementLike`는 이 파일에 필요한 필드만 가진 최소 타입이다(`id,type,x,y,width,height,link?,text?,containerId?,startBinding?,endBinding?,isDeleted?`). 테스트는 일반 객체로 만든다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `md embeddable becomes doc, notion embeddable ignored`
  - `subpath link goes to skippedLinks`
  - `horizontal line over doc is underline, vertical is range, rect is box`: height 0 → underline, width 0 → range. 그 밖에는 가로세로 비율로 정한다(높이 < 8 → underline).
  - `line outside every doc bbox is neither mark nor comment`
  - `stickynote text becomes comment with sticky bbox`: 스티키 하나 + `containerId`가 그것인 text → comment 1개. text는 스티키 bbox를 쓴다. 텍스트는 `originalText ?? text`.
  - `free text outside doc is comment, free text inside doc bbox is ignored`
  - `arrow from sticky to mark fills arrowToIds`: 화살표 `startBinding=스티키`, `endBinding=line` → 그 comment의 `arrowToIds=[lineId]`. 방향이 반대여도 같다.
  - `arrow bound to embeddable is not an anchor link`: 끝이 embeddable이면 `arrowToIds=[]`
  - `selected text whose container is selected is not double counted`
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. 표시가 여러 doc에 걸치면 bbox 중심이 들어 있는 doc을 고른다.
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** 커밋 `feat(annotation-export): 선택 요소 분류`

### Task 3: 원문 위치 찾기

**Files:** Create `src/utils/annotationExport/locateQuote.ts`, `tests/annotationExportLocate.test.mjs`

**Interfaces:**
- Produces:
  ```ts
  type Probe = { text: string; yRatio: number };   // text: DOM에서 읽은 문자열, yRatio: 문서 높이 대비 표시 위치 0..1
  locateQuote(source: string, probe: Probe): { lineStart: number; lineEnd: number; quote: string | null } | null
  locateLineRange(source: string, probes: Probe[]): { lineStart: number; lineEnd: number } | null   // range 표시용: 첫·마지막 probe의 줄
  ```

- [ ] **Step 1: 실패하는 테스트 작성**
  - `plain paragraph returns its line and exact substring`
  - `rendered text without markdown syntax still matches`: 원문 `**굵은** 문장 [링크](x)` + probe `굵은 문장 링크` → 그 줄, quote는 probe 텍스트. 비교 전에 원문의 인라인 마크다운 기호와 공백을 정규화하고, 원본 줄로 되돌려 매핑한다.
  - `duplicate text resolves by y-order hint`: 같은 문장이 10번째 줄과 90번째 줄(총 100줄)에 있고 yRatio 0.88이면 → 90번째 줄
  - `table cell maps to whole table range`: 107~125줄의 표 안 셀 텍스트 `없음` → `{lineStart:107,lineEnd:125, quote:"없음"}`
  - `frontmatter counts toward line numbers`
  - `no match returns null`
  - `range probes span first to last line`
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. 블록 경계(표, 코드펜스, 리스트 항목)는 줄 단위 스캔으로 구한다. 마크다운 파서 의존성은 추가하지 않는다.
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** 커밋 `feat(annotation-export): 원문 줄 위치 계산`

### Task 4: AI 짝짓기 입출력 + fallback

**Files:** Create `src/utils/annotationExport/pairing.ts`, `tests/annotationExportPairing.test.mjs`

**Interfaces:**
- Consumes: `Anchor`, `Comment`, `Pairing`
- Produces:
  ```ts
  buildPairingPrompt(anchors: Anchor[], comments: Comment[]): string
  parsePairingResponse(raw: string, anchors: Anchor[], comments: Comment[]): Pairing[] | null   // 스키마 불일치 시 null
  nearestPairing(anchors: Anchor[], comments: Comment[]): Pairing[]
  toFeedbackItems(pairings: Pairing[], anchors: Anchor[], comments: Comment[], defaultFilePath: string): FeedbackItem[]
  ```
- 프롬프트 계약: JSON만 응답한다. 형식은 `{"pairings":[{"commentId":"...","anchorIds":["..."]}]}`이다. 모든 commentId를 정확히 한 번씩 쓴다. 화살표(`arrowToIds`)가 있으면 반드시 따른다. 인용문이나 줄 번호는 쓰지 않는다. 입력에는 id, quote, lines, bbox, 코멘트 텍스트를 담는다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `prompt contains every id and the JSON contract`
  - `parse accepts claude --output-format json envelope`: `{"type":"result","result":"```json\n{...}\n```"}` 형태(코드펜스 포함)도 파싱한다.
  - `parse rejects unknown anchorId or missing commentId` → null
  - `fallback pairs each comment to nearest anchor`: 거리 = bbox 사이 최단거리이고, 기준 거리 400px을 넘으면 general(`anchorIds: []`)
  - `fallback respects arrows`
  - `toFeedbackItems drops anchors no comment points to and copies quote/lines from anchors`: AI 응답에 어떤 문자열이 있든 quote는 anchor 값과 같다.
  - `one comment with two anchors yields merged line range`: 줄 범위는 min~max, quote는 두 quote를 ` … `로 잇는다.
  - `general comment uses defaultFilePath`(문서가 하나일 때) — 문서가 여럿이면 bbox가 가장 가까운 doc의 파일을 쓴다. 이 경우는 호출 측에서 `defaultFilePath`를 결정한다.
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** 커밋 `feat(annotation-export): AI 짝짓기 입출력과 fallback`

### Task 5: 표시 아래 텍스트 탐침 (Obsidian 의존)

**Files:** Create `src/view/annotationExport/probeAnchors.ts`

**Task 0 스파이크 결과 (2026-11-05, 테스트 볼트 1209줄 md, embeddable 800×30000):**
1. 캔버스 레이어가 embeddable 위를 덮어서 `caretRangeFromPoint`/`elementFromPoint`는 캔버스를 돌려준다. → 탐침은 hit-test가 아니라 **텍스트 노드의 `Range.getClientRects()`와 표시 band(화면 좌표)의 교차**로 한다.
2. 문서 전체 높이로 펼친 embeddable은 reading view의 section이 전부 렌더링된다(605/605). 화면 밖 글자도 client rect가 계산된다. 가상화 위험은 없다. 단 embeddable이 **마운트돼 있어야** 하므로, 표시마다 화면으로 스크롤한 뒤 300ms 기다린다(800ms로 확인함).
3. `view.getEmbeddableLeafElementById(id)`는 뷰를 다시 연 뒤 stale(`empty` 뷰, `containerEl` 미연결)일 수 있다. → 문서 DOM은 `view.contentEl.querySelectorAll(".markdown-preview-view")` 중 client rect가 doc의 화면 rect와 겹치는 것으로 찾는다. 화면 좌표 = `(scene + scroll) × zoom + offset(Left|Top)`.

**Interfaces:**
- Consumes: `DocRef`, `Mark`, Task 3 `Probe`
- Produces: `probeMarks(view: ExcalidrawView, docs: DocRef[], marks: Mark[]): Promise<Map<string /*markId*/, Probe[]>>`
  - underline: 선의 x 구간을 따라 12px 간격으로, 선보다 `0.6 × 줄 높이`(줄 높이는 탐침 지점 요소의 computed `line-height`, 없으면 24px × zoom) 위 화면 좌표에서 `caretRangeFromPoint`로 단어를 모아 하나의 Probe로 만든다.
  - box: 박스 내부의 줄마다 위와 같이 처리한다.
  - range: 세로선의 위·아래 끝 근처 y에서 문서 본문 x 중앙으로 Probe를 2개 만든다.
  - 각 표시 전에 Task 0에서 확인한 방법으로 화면에 띄우고 렌더링을 기다린다. 시작 전 `appState`의 `scrollX/scrollY/zoom`을 저장하고 `finally`에서 복원한다.
  - `yRatio = (mark.bbox.y - doc.bbox.y) / doc.bbox.height`

- [ ] **Step 1:** 구현
- [ ] **Step 2:** 빌드 후 테스트 볼트에 배포한다(메모리 `excalidraw-fork-local-deploy` 절차, `npm install` 금지).
- [ ] **Step 3: 수동 검증.** spec 8절의 보드(밑줄 1줄, 여러 줄 밑줄, 박스, 세로선, 표 셀, 화면 밖 하단 밑줄)에서 eval로 `probeMarks` 결과를 출력한다. 각 Probe 텍스트가 육안으로 본 밑줄 문장과 같고, 끝난 뒤 뷰가 원래 위치로 돌아왔는지 확인한다. 활성 파일명 가드를 넣고, 메인 볼트에는 실행하지 않는다.
- [ ] **Step 4:** 커밋 `feat(annotation-export): 표시 아래 텍스트 탐침`

### Task 6: claude 실행기 + 설정

**Files:** Create `src/view/annotationExport/runClaude.ts`; Modify `src/core/settingsDefaults.ts`, 설정 타입, 설정 탭(기존 AI 관련 설정 근처, 패턴은 기존 텍스트 설정 하나를 따른다)

**Interfaces:**
- Produces: `runClaude(binaryPath: string, prompt: string, timeoutMs = 60000): Promise<{ ok: true; stdout: string } | { ok: false; reason: "not-found" | "timeout" | "exit"; detail: string }>`
- 설정 `annotationExportClaudePath: string`. 기본값은 `${os.homedir()}/.local/bin/claude`.
- 인자: `["-p", "--output-format", "json"]`, prompt는 stdin으로 넘긴다(긴 프롬프트 대비). `shell: false`.

- [ ] **Step 1:** 구현
- [ ] **Step 2: 수동 검증.** 테스트 볼트 eval로 ① 정상 경로 → `ok:true`이고 stdout이 JSON envelope ② 잘못된 경로 → `not-found` ③ `timeoutMs=1` → `timeout`
- [ ] **Step 3:** 커밋 `feat(annotation-export): claude -p 실행기와 경로 설정`

### Task 7: 명령 + 오케스트레이션 + 종단 검증

**Files:** Create `src/view/annotationExport/exportAnnotations.ts`; Modify `src/core/managers/CommandManager.ts`(기존 `excalidraw-paste-markdown-embeddable` 옆), 번역 키 `EXPORT_CANVAS_ANNOTATIONS`(en: "Copy canvas annotations as feedback", ko: "캔버스 주석을 피드백으로 복사")

**Interfaces:**
- Consumes: Task 2 `classifySelection`, Task 5 `probeMarks`, Task 3 `locateQuote/locateLineRange`, Task 4 전부, Task 6 `runClaude`, Task 1 `formatAnnotations`
- Produces: `exportAnnotations(view: ExcalidrawView): Promise<void>`, 명령 id `excalidraw-export-canvas-annotations`(checkCallback: 활성 ExcalidrawView가 있을 때만)

흐름: 분류 → (doc 0개 또는 comment 0개면 안내 Notice 후 종료) → 원본 md 읽기(`app.vault.cachedRead`) → probe → locate로 `Anchor[]` 생성(실패하면 `quote:null`, 줄은 yRatio로 근사) → 진행 Notice "AI가 코멘트를 묶는 중…" → `runClaude` → 파싱(실패하면 1회 재시도, 그래도 실패하면 `nearestPairing` + 이유 Notice) → `toFeedbackItems` → `formatAnnotations` → `navigator.clipboard.writeText` → "N개 코멘트 복사됨" Notice. `skippedLinks`가 있으면 Notice에 덧붙인다.

- [ ] **Step 1:** 구현 + 명령 등록
- [ ] **Step 2:** `npm run test:annotation-export` PASS, `npm run build` 성공
- [ ] **Step 3: 종단 검증 (spec 8절).** 테스트 볼트 보드에서 문서와 주석 전체를 선택하고 명령을 실행한 뒤 클립보드를 확인한다. ① 모든 인용문이 원본 md의 부분 문자열(스크립트로 검사) ② 줄 번호 수동 대조 ③ 코멘트 없는 밑줄은 빠짐 ④ 화살표 코멘트는 그 표시에 연결됨 ⑤ 문서 밖 코멘트는 General ⑥ claude 경로를 일부러 틀리게 해도 fallback 결과가 복사되고 Notice가 뜸
- [ ] **Step 4:** 결과 클립보드를 Claude Code 세션에 붙여 넣어 agent가 위치를 올바로 짚는지 한 번 확인한다(사용자와 함께).
- [ ] **Step 5:** 커밋 `feat(annotation-export): 캔버스 주석 피드백 복사 명령`
