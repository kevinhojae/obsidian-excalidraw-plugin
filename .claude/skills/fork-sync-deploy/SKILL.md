---
name: fork-sync-deploy
description: kevinhojae Excalidraw 포크(플러그인과 코어)에 업스트림 업데이트를 머지하거나, 빌드해서 Obsidian 볼트에 배포하거나, 배포본을 테스트 볼트에서 확인할 때 쓴다. "업스트림 업데이트", "새 버전 반영", "빌드해서 배포", "볼트에 올려", "테스트 볼트에서 확인" 같은 요청에 해당한다.
---

# 포크 업스트림 반영·빌드·배포

경로:
- 플러그인: `~/Codes/obsidian-excalidraw-plugin`
- 코어: `~/Codes/excalidraw`
- 메인 볼트 플러그인 폴더: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/hojae-whiteboard/.obsidian/plugins/obsidian-excalidraw-plugin/`
- 테스트 볼트: `~/Codes/excalidraw-test-vault`(볼트 이름 `excalidraw-test-vault`)

배경과 함정은 레포 루트의 `CLAUDE.md`에 있다. 이 문서는 절차만 다룬다.

## 1. 업스트림 반영

1. 두 레포에서 `git fetch upstream --tags`를 실행한다. 작업 트리가 깨끗한지, 다른 worktree가 쓰는 브랜치가 있는지(`git worktree list`) 확인한다.
2. 플러그인: `master`에서 업스트림 릴리스 태그를 머지한다(`git merge <버전 태그>`). 머지 결과의 `package.json`에서 `"@zsviczian/excalidraw"` 버전을 읽는다.
3. 코어: `packages/excalidraw/package.json` version이 그 버전인 `upstream/master` 커밋을 `master`에 머지한다.
4. 충돌이 나면 포크 기능을 살리는 쪽으로 해결한다. `styles.css` 끝에서 난 충돌은 두 블록을 모두 남기고, `{`와 `}` 개수를 확인한다.
   - 2.29.2를 머지할 때는 포크의 Markdown 카드 붙여넣기가 업스트림의 코드 블록 붙여넣기 재작성과 충돌했다. 이때 코드 블록 카드는 업스트림의 `insertCodeBlock` 흐름을 따르되, 포크 스타일(투명 테두리, 폭 800, `fitEmbeddableHeightToContent`)은 유지했다.
5. 업스트림이 포크 기능과 같은 것을 구현했다면, 포크 쪽 코드를 지울지 사용자에게 묻는다.

## 2. 빌드

1. 코어: `cd ~/Codes/excalidraw/packages/excalidraw && yarn build:obsidian`을 실행한다(약 1분). 산출물은 `dist/obsidian/`에 생기는 4개 파일이다.
2. 플러그인 `node_modules/@zsviczian/excalidraw/dist/obsidian/`의 기존 파일을 scratchpad에 백업한 뒤, 코어 산출물 4개를 덮어 복사한다.
3. 두 위치의 파일을 `cmp`로 비교해 같은지 확인한다. 이 레포에서 `npm install`을 하지 않는다.
4. 플러그인: `npm run build`를 실행한다. `dist/`에 `main.js`, `styles.css`, `manifest.json`이 생긴다.

## 3. 배포

1. 배포 전에 다음을 확인한다.
   - `git branch --show-current`가 의도한 브랜치인가(보통 `master`).
   - `dist/manifest.json` 버전이 볼트에 배포된 버전보다 낮지 않은가.
   - 볼트에 배포된 `main.js`에 다른 세션이 넣은 기능이 있는데 이번 빌드에서 빠지지 않는가.
2. 볼트의 기존 `main.js`, `styles.css`, `manifest.json`을 scratchpad에 백업한다.
3. `dist/`의 3개 파일을 볼트 플러그인 폴더에 복사한다.
4. 배포본에서 새 기능에만 있는 문자열을 grep해 반영됐는지 확인한다. `main.js`는 압축돼 있으니 함수 이름 대신 문자열 상수나 CSS 클래스로 찾는다.
5. 메인 볼트는 사용자가 플러그인을 껐다 켜거나 Obsidian을 다시 시작해야 적용된다. 이 사실을 사용자에게 알린다. 메인 볼트에는 합성 키나 합성 이벤트를 보내지 않는다.

## 4. 테스트 볼트에서 확인

- 플러그인 리로드:

  ```sh
  obsidian vault=excalidraw-test-vault eval code='(async()=>{await app.plugins.disablePlugin("obsidian-excalidraw-plugin");await app.plugins.enablePlugin("obsidian-excalidraw-plugin")})()'
  ```

  매니페스트 버전을 바꿨다면 먼저 `app.plugins.loadManifests()`를 호출한다.
- `eval`과 `dev:screenshot`은 창이 비활성이어도 동작한다. 단 비활성 창에서는 `el.focus()`의 focus 이벤트가 오지 않으므로 `FocusEvent`를 직접 dispatch한다.
- 활성 탭은 언제든 바뀔 수 있다. 다른 세션이 e2e를 돌리고 있을 수도 있다. `app.workspace.activeLeaf` 대신 `getLeavesOfType("excalidraw")`에서 파일 경로로 뷰를 찾고, 파일명 가드를 넣는다. 다른 작업 중인 탭은 새로 열거나 바꾸지 않는다.
- 같은 도면을 두 탭에 열면 선택과 명령이 다른 탭으로 간다. 백그라운드 탭의 임베드는 렌더링되지 않는다. `getLeaf(false).openFile`을 반복하지 말고 이미 열린 leaf를 활성화한다.
- 플러그인을 리로드한 직후 `eval`로 명령을 실행하면, 뷰가 교체되면서 선택이 비어 명령이 일찍 끝날 수 있다. 뷰가 다시 준비될 때까지 기다린다.
- 화면 밖 embeddable은 마운트되지 않는다. 먼저 스크롤해서 화면에 들어오게 한다.
- 격리된 iframe 내용은 스크린샷에 찍히지 않는다. HTML에 `parent.postMessage` 프로브를 넣어 확인한다.
- 합성 마우스 이벤트로는 실제 텍스트 선택이나 드래그 같은 브라우저 기본 동작이 일어나지 않는다. hit-test(`elementFromPoint`)와 상태 변화까지만 확인하고, 실제 조작은 사용자에게 확인을 부탁한다.
- Obsidian은 hotkey가 일치하면 명령 실행 여부와 상관없이 키를 소비한다. Excalidraw 단축키가 Obsidian 바인딩과 겹치면 캔버스에서 먹히지 않는다. 해결책은 `modifierKeyOverrides`다.

## 5. 마무리

- 커밋은 `feat/*` 브랜치에서 하고 `master`에 머지한다. push 방법은 `CLAUDE.md`를 따른다.
- 사용자에게 다음을 보고한다.
  - 배포한 버전과 포함된 기능
  - 백업 위치(전체 절대경로)
  - 확인하지 못한 항목
