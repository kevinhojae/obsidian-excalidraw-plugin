@AGENTS.md

# kevinhojae 포크 운영 메모

이 파일은 포크에만 있다. 업스트림(zsviczian)의 `AGENTS.md`는 위에서 그대로 불러온다. 포크 관련 내용은 `AGENTS.md`가 아니라 이 파일, `docs/fork/`, `.claude/`에 쓴다. 업스트림이 `AGENTS.md`를 자주 고치므로, 거기에 쓰면 업스트림을 머지할 때마다 충돌이 난다.

## 어디에 무엇이 있나

- `docs/fork/README.md`: 포크 기능 목록과 검증 표. **포크가 지켜야 할 것의 기준**이다. 새 기능을 넣거나 업스트림을 반영할 때마다 갱신하고, 다시 확인한다.
- `scripts/build-with-engine-fork.mjs`: 코어 빌드, 산출물 복사, 플러그인 빌드를 한 번에 한다.
- `scripts/install-local.mjs`: 볼트에 설치한다. 기본은 dry run이다. `--apply`는 백업한 뒤 설치하고, `--rollback`은 백업으로 되돌린다. `data.json`은 건드리지 않는다.
- `.claude/skills/fork-feature-dev`: 새 커스텀 기능을 개발하는 절차.
- `.claude/skills/fork-sync-deploy`: 업스트림 반영, 빌드, 배포, 테스트 볼트 확인 절차.

## 구조와 브랜치

- 포크는 2개다. 플러그인은 이 레포, 코어는 `~/Codes/excalidraw`(`kevinhojae/excalidraw`)다. 두 레포 모두 `origin`이 포크이고 `upstream`이 zsviczian 원본이다.
- 코어 변경은 npm에 publish하지 않는다. 코어 산출물을 이 레포 `node_modules/@zsviczian/excalidraw/dist/obsidian/`에 복사해서 빌드한다. 짝이 맞는 코어 버전은 `package.json`의 `"@zsviczian/excalidraw"` 값이다.
- 두 레포 모두 `master`를 커스텀 브랜치로 쓴다. 업스트림이 업데이트되면 upstream을 `master`에 머지한다. rebase나 force push는 하지 않는다.
- 기능은 `master`에서 딴 `feat/*` 브랜치에서 만들고 `master`에 머지한다. 다른 worktree에 체크아웃된 브랜치는 직접 고치지 않는다.

## 커스텀 코드 원칙 (업스트림과 덜 부딪히게)

- 새 로직은 가능하면 새 파일에 둔다. 업스트림 파일에는 연결 지점만 최소한으로 넣는다.
- 업스트림 파일의 큰 블록을 고치거나 옮기지 않는다. 포매팅이나 정리 같은 무관한 변경은 충돌만 늘린다.
- 플러그인만으로 되면 코어는 고치지 않는다. 코어를 고치면 업스트림을 반영할 때마다 두 레포를 맞춰야 한다.
- `styles.css`에 추가할 때는 파일 끝에 주석 달린 블록으로 넣는다.

## 함정

- **`npm install` 주의:** 이 레포에서 `npm install`이나 `npm ci`를 하면 복사해 둔 코어 산출물이 publish된 버전으로 되돌아간다. 그 뒤에는 반드시 `build-with-engine-fork.mjs`로 빌드한다.
- **플러그인 "업데이트" 버튼:** Obsidian 커뮤니티 플러그인 화면에서 "업데이트"를 누르면 포크 빌드가 업스트림 원본으로 덮인다. 업스트림 반영은 항상 포크에 머지해서 한다.
- **오래된 체크아웃에서 배포 금지:** 빌드는 지금 체크아웃된 브랜치와 `../excalidraw`의 현재 브랜치를 그대로 따른다. 오래된 브랜치에서 빌드해 배포하면, 다른 세션이 배포한 최신 버전을 덮어쓴다. 실제로 이런 일이 있었다. 배포 전에 두 레포의 브랜치를 확인하고, `install-local.mjs` dry run에 나오는 버전을 확인한다.
- **줄바꿈 보존:** `styles.css`는 CRLF와 LF가 섞여 있다. Python 텍스트 모드로 읽고 쓰면 파일 전체가 LF로 바뀌어 diff가 수천 줄이 된다. `Edit` 도구나 `perl -i`를 쓰고, 커밋 전에 `git diff --stat`으로 확인한다.
- **`styles.css` 끝의 충돌:** 포크와 업스트림이 둘 다 끝에 블록을 붙이면 충돌이 난다. 두 블록을 모두 남기되, git이 닫는 `}`를 공통 줄로 처리해 하나가 빠질 수 있다. `{`와 `}` 개수를 세어 확인한다.
- **기존 실패 비교:** `npm run code`(eslint)와 `test:fast`는 base에서도 실패가 있다. 회귀 여부는 변경 전 결과와 비교해서 판단한다. `test:fast`는 native host/CLI 환경 테스트 약 20건이, 코어 vitest는 순수 업스트림에서도 약 1490건이 실패한다. `verify:obsidian`은 볼트 이름 `excalidraw-test`만 허용해서 테스트 볼트(`excalidraw-test-vault`)에서는 실행되지 않는다.
- **도구 함정:** `yarn prettier`에는 레포 전체 패턴이 붙어 있으니, 파일 단위로는 `node_modules/.bin/prettier`를 직접 실행한다. Bash 도구는 zsh라서 `$F` 같은 공백 구분 목록이 나뉘지 않는다. 배열을 쓴다.
- **키 입력:** macOS 두벌식에서 Cmd 조합의 `event.key`는 라틴 문자로 들어온다. Cmd 없는 키만 `ㅂ`처럼 한글로 들어오니, 비라틴 키보드 문제는 수정키 없는 키 경로에서만 찾으면 된다. Obsidian은 hotkey가 일치하면 명령 실행 여부와 상관없이 키를 소비한다. Excalidraw 단축키가 Obsidian 바인딩과 겹치면 볼트 설정 `modifierKeyOverrides`로 해결한다.

## push

- 전역 git credential helper가 회사 계정 `devin-hp`로 고정돼 있어서, 그냥 push하면 403이 난다. 설정 파일은 바꾸지 말고 명령에서 덮어쓴다.

```sh
git -c credential.https://github.com.helper= \
  -c 'credential.https://github.com.helper=!f() { test "$1" = get && echo username=kevinhojae && echo password=$(/opt/homebrew/bin/gh auth token --user kevinhojae); }; f' \
  push origin master
```

- 두 포크 모두 공개 레포다. push 전에 비밀값이 들어갔는지 훑어본다. push는 사용자가 요청할 때만 한다.
