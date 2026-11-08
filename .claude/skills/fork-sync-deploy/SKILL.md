---
name: fork-sync-deploy
description: kevinhojae Excalidraw 포크(플러그인과 코어)에 공식 업스트림 업데이트를 반영할 때 쓴다. 커스텀 기능을 유지한 채 업스트림과 맞추고, 빌드해서 Obsidian 볼트에 배포하고, 테스트 볼트에서 확인하는 절차다. "업스트림 업데이트", "공식 플러그인 새 버전 반영", "빌드해서 배포", "볼트에 올려", "테스트 볼트에서 확인" 같은 요청에 해당한다. 새 기능 개발은 fork-feature-dev를 쓴다.
---

# 포크 업스트림 반영·빌드·배포

경로:
- 플러그인: `~/Codes/obsidian-excalidraw-plugin`
- 코어: `~/Codes/excalidraw`
- 메인 볼트: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/hojae-whiteboard`
- 테스트 볼트: `~/Codes/excalidraw-test-vault`(볼트 이름 `excalidraw-test-vault`)

규칙과 함정은 레포 루트의 `CLAUDE.md`에 있다. 지켜야 할 기능 목록은 `docs/fork/README.md`에 있다.

## 1. 업스트림 반영

1. 두 레포에서 `git fetch upstream --tags`를 실행한다. 확인할 것:
   - 작업 트리가 깨끗한가.
   - `master`가 체크아웃돼 있는가.
   - 다른 worktree가 쓰는 브랜치가 있는가(`git worktree list`).
2. 플러그인: 업스트림 릴리스 태그를 `master`에 머지한다(`git merge <버전 태그>`). 머지 결과의 `package.json`에서 `"@zsviczian/excalidraw"` 버전을 읽는다.
3. 코어: `packages/excalidraw/package.json` version이 그 버전인 `upstream/master` 커밋을 `master`에 머지한다.
4. 충돌은 포크 기능을 살리는 쪽으로 해결한다. 각 충돌에서 포크 쪽 코드가 README의 어느 기능에 해당하는지 확인한다.
   - `styles.css` 끝의 충돌은 두 블록을 모두 남기고, `{`와 `}` 개수를 확인한다.
   - 이전 사례: 2.29.2에서는 포크의 Markdown 카드 붙여넣기가 업스트림의 코드 블록 붙여넣기 재작성과 충돌했다. 코드 블록 카드는 업스트림 `insertCodeBlock` 흐름을 따르되, 포크 스타일(투명 테두리, 폭 800, `fitEmbeddableHeightToContent`)은 유지했다.
5. 업스트림 릴리스 노트를 훑어서, 업스트림이 포크 기능과 같은 것을 구현했는지 본다. 그렇다면 포크 코드를 지울지 사용자에게 묻는다.

## 2. 빌드

1. 플러그인이 `master`에, 코어(`../excalidraw`)가 짝 버전의 `master`에 있는지 확인한다.
2. `node scripts/build-with-engine-fork.mjs`를 실행한다. 이 스크립트가 코어 빌드, 산출물 4개 복사, 플러그인 빌드를 하고, 마지막 줄에 두 레포의 리비전을 출력한다. 이 리비전이 의도한 커밋이고 `-dirty`가 아닌지 확인한다.
3. `npm run code`와 `npm run test:fast`를 머지 전 결과와 비교한다. 새로 생긴 실패만 본다.

## 3. 기능 회귀 확인 (내 기능이 살아 있는가)

머지가 깨끗해도 기능은 조용히 깨질 수 있다. 업스트림이 이벤트 흐름, 클래스 이름, z-index, 설정 구조를 바꾸면 포크 코드가 컴파일은 돼도 동작하지 않는다.

1. 테스트 볼트에 배포한다(4절).
2. `docs/fork/README.md` 검증 표를 위에서부터 다시 확인한다. 스크립트로 확인할 수 있는 항목은 직접 확인한다. 실제 마우스 드래그, IME, 클립보드처럼 합성 이벤트로 재현되지 않는 항목은 사용자에게 확인을 부탁한다.
3. 각 결과를 표에 갱신한다. 표의 기준 버전도 갱신한다.
4. 깨진 기능은 고치고 나서 메인 볼트에 배포한다.

## 4. 배포

`install-local.mjs`를 쓴다. 손으로 복사하지 않는다.

1. dry run: `node scripts/install-local.mjs --vault <볼트 경로>`. 출력에서 다음을 확인한다.
   - 대상 버전과 원본 버전
   - 바뀌는 파일
   - 원본 버전이 대상보다 낮지 않은가. 다른 세션의 배포를 덮어쓰지 않는지 여기서 확인한다.
2. 플러그인을 끈다.
   - 테스트 볼트: `obsidian vault=excalidraw-test-vault eval code='app.plugins.disablePlugin("obsidian-excalidraw-plugin")'`
   - 메인 볼트: 사용자에게 플러그인을 끄거나 Obsidian을 종료해 달라고 부탁한다. 메인 볼트에는 eval이나 합성 이벤트를 보내지 않는다.
3. `--apply`로 설치한다. 출력에 나오는 백업 경로(`~/Obsidian-plugin-backups/...`)와 롤백 명령을 사용자에게 전달한다.
4. 플러그인을 다시 켠다. 매니페스트 버전이 바뀌었으면 먼저 `app.plugins.loadManifests()`를 호출한다.

## 5. 진행 중인 기능 브랜치 갱신

새 `master`를 진행 중인 `feat/*` 브랜치에 머지해서, 다음 머지 때 충돌이 쌓이지 않게 한다. 다른 worktree에서 쓰는 브랜치라면 직접 머지하지 않는다. 그 worktree의 담당 세션이나 사용자에게 알린다.

## 6. 테스트 볼트 확인 요령

- `obsidian vault=<이름> eval code=...`와 `dev:screenshot`은 창이 비활성이어도 동작한다. 단 비활성 창에서는 `el.focus()`의 focus 이벤트가 오지 않으므로 `FocusEvent`를 직접 dispatch한다.
- 활성 탭은 언제든 바뀔 수 있고, 다른 세션이 e2e를 돌리고 있을 수도 있다. `activeLeaf` 대신 `getLeavesOfType("excalidraw")`에서 파일 경로로 뷰를 찾고, 파일명 가드를 넣는다. 다른 작업 중인 탭은 새로 열거나 바꾸지 않는다.
- 같은 도면을 두 탭에 열면 선택과 명령이 다른 탭으로 간다. 백그라운드 탭의 임베드는 렌더링되지 않는다. 이미 열린 leaf를 활성화한다.
- 플러그인을 리로드한 직후 eval로 명령을 실행하면, 뷰가 교체되면서 선택이 비어 명령이 일찍 끝날 수 있다. 뷰가 다시 준비될 때까지 기다린다.
- 화면 밖 embeddable은 마운트되지 않는다. 먼저 스크롤해서 화면에 들어오게 한다.
- 격리된 iframe 내용은 스크린샷에 찍히지 않는다. HTML에 `parent.postMessage` 프로브를 넣어 확인한다.
- 합성 이벤트로는 실제 텍스트 선택이나 드래그 같은 브라우저 기본 동작이 일어나지 않는다. hit-test(`elementFromPoint`)와 상태 변화까지만 확인하고, 실제 조작은 사용자에게 부탁한다.

## 7. 마무리

- push는 사용자가 요청할 때만 한다. 방법은 `CLAUDE.md`를 따른다.
- 사용자에게 다음을 보고한다.
  - 반영한 업스트림 버전
  - 충돌과 그 해결
  - 기능 회귀 확인 결과
  - 확인하지 못한 항목
  - 백업 위치(전체 절대경로)
