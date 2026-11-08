@AGENTS.md

# kevinhojae 포크 운영 메모

이 파일은 포크에만 있다. 업스트림(zsviczian)의 `AGENTS.md`는 위에서 그대로 불러온다. 포크 관련 내용은 `AGENTS.md`가 아니라 이 파일과 `.claude/`에 쓴다. 업스트림이 `AGENTS.md`를 자주 고치므로, 거기에 쓰면 업스트림을 머지할 때마다 충돌이 난다.

## 구조

- 포크는 2개다. 플러그인은 이 레포, 코어는 `~/Codes/excalidraw`(`kevinhojae/excalidraw`)다. 두 레포 모두 `origin`이 포크이고 `upstream`이 zsviczian 원본이다.
- 코어 변경은 npm에 publish하지 않는다. 코어를 빌드한 산출물을 이 레포 `node_modules/@zsviczian/excalidraw/dist/obsidian/`에 복사한 뒤 플러그인을 빌드한다. 절차는 `fork-sync-deploy` 스킬에 있다.
- 짝이 맞는 코어 버전은 `package.json`의 `"@zsviczian/excalidraw"` 값이다(예: 플러그인 2.29.2 ↔ 코어 0.18.147).

## 브랜치 전략

- 두 레포 모두 `master`를 커스텀 브랜치로 쓴다. 업스트림이 업데이트되면 upstream을 `master`에 머지한다. rebase나 force push는 하지 않는다.
- 플러그인은 업스트림 릴리스 태그(예: `2.29.2`)를 머지한다. 코어에는 태그가 없으므로, `packages/excalidraw/package.json`의 version이 짝 버전인 `upstream/master` 커밋을 머지한다.
- 기능은 `feat/*` 브랜치에서 만들고 `master`에 머지한다. 다른 worktree에 체크아웃된 브랜치는 직접 고치지 않는다. 그 브랜치까지 `master`를 fast-forward 한 뒤 내 브랜치를 머지한다.

## 함정

- **`npm install` 주의:** 이 레포에서 `npm install`을 하면 복사해 둔 코어 산출물이 npm에 publish된 버전으로 되돌아간다. 코어 수정이 아무 경고 없이 빠진다. 빌드 전에 코어 `dist/obsidian/`과 `node_modules` 쪽 파일을 `cmp`로 비교한다.
- **플러그인 "업데이트" 버튼:** Obsidian 커뮤니티 플러그인 화면에서 "업데이트"를 누르면 포크 빌드가 업스트림 원본으로 덮인다. 업스트림 반영은 항상 포크에 머지해서 한다.
- **오래된 체크아웃에서 배포 금지:** 빌드 산출물은 지금 체크아웃된 브랜치와 node_modules의 코어 버전을 그대로 따른다. 오래된 브랜치에서 빌드해 배포하면, 다른 세션이 배포한 최신 버전을 덮어쓴다. 실제로 이런 일이 있었다. 배포 전에 `git branch --show-current`, `manifest.json` 버전, 볼트에 배포된 버전을 확인한다.
- **줄바꿈 보존:** `styles.css`는 CRLF와 LF가 섞여 있다. Python 텍스트 모드로 읽고 쓰면 파일 전체가 LF로 바뀌어 diff가 수천 줄이 된다. `Edit` 도구나 `perl -i`를 쓰고, 커밋 전에 `git diff --stat`으로 확인한다.
- **`styles.css` 끝의 충돌:** 포크와 업스트림이 둘 다 `styles.css` 끝에 블록을 붙이면 머지 충돌이 난다. 두 블록을 모두 남기되, git이 닫는 `}`를 공통 줄로 처리해 하나가 빠질 수 있다. `{`와 `}` 개수를 세어 확인한다.
- **기존 실패 비교:** `npm run code`(eslint)와 `test:fast`는 base에서도 실패가 있다. 회귀 여부는 변경 전 결과와 비교해서 판단한다. `test:fast`는 native host/CLI 환경 테스트 약 20건이, 코어 vitest는 순수 업스트림에서도 약 1490건이 실패한다. `verify:obsidian`은 볼트 이름 `excalidraw-test`만 허용해서 테스트 볼트(`excalidraw-test-vault`)에서는 실행되지 않는다.
- **도구 함정:** `yarn prettier`에는 레포 전체 패턴이 붙어 있으니, 파일 단위로는 `node_modules/.bin/prettier`를 직접 실행한다. Bash 도구는 zsh라서 `$F` 같은 공백 구분 목록이 나뉘지 않는다. 배열을 쓴다.
- **키 입력:** macOS 두벌식에서 Cmd 조합의 `event.key`는 라틴 문자로 들어온다. Cmd 없는 키만 `ㅂ`처럼 한글로 들어오니, 비라틴 키보드 문제는 수정키 없는 키 경로에서만 찾으면 된다.

## push

- 전역 git credential helper가 회사 계정 `devin-hp`로 고정돼 있어서, 그냥 push하면 403이 난다. 설정 파일은 바꾸지 말고 명령에서 덮어쓴다.

```sh
git -c credential.https://github.com.helper= \
  -c 'credential.https://github.com.helper=!f() { test "$1" = get && echo username=kevinhojae && echo password=$(/opt/homebrew/bin/gh auth token --user kevinhojae); }; f' \
  push origin master
```

- 두 포크 모두 공개 레포다. push 전에 비밀값이 들어갔는지 훑어본다.
