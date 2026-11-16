# CLAUDE.md — build-2611-07 수출입통관통합관리 DashBoard

## 일하는 순서

- **먼저 계획을 설명하고, 승인받은 뒤 고친다.** 원인 · 고칠 파일 · 바뀌는 동작 · 시험 계획을 말하고, 정해야 할 것은 묻는다.
- 고친 뒤에는 **시험을 돌리고 판 번호를 올린다.**
  - `node test/logic.test.js` — 모두 통과해야 한다. 기존 예제 5종(`sampleFiles`)의 판단 결과가 바뀌면 안 된다.
  - 화면을 고쳤으면 `node test/smoke.browser.js`(playwright 필요, 없으면 건너뛰고 그렇다고 알린다).
  - 도구 판은 `CHANGELOG.md` 맨 위에 기존 형식(`## v1.x.y — 날짜`)으로 적는다. 쪽에 붙은 판 번호(`?v=2026-MM-DD.N`)를 쓰는 파일을 고쳤으면 그 번호도 올린다.
  - 개발일지는 `Dev_md/날짜_판_주제.md` (무엇을 · 왜 · 어떻게 확인했나 · 남은 일).
- 커밋 · 푸시는 요청받았을 때만.

## 구조

- **서버 없는 정적 사이트**(HTML · CSS · JS). 빌드 단계 없음.
- **계산 · 판정 규칙은 `js/customs.js`** 에 둔다(열 이름 짝짓기 · 종류 판단 `detectKind` · `DATASETS` · 값 읽기 · 집계). 화면(`js/dash.js` 등)은 판정하지 않고 그리기만 한다. 규칙은 `test/logic.test.js` 로 고정한다.
- 열 이름이 다른 파일을 받으려면 코드가 아니라 `DATASETS` 의 `aliases` · `decisive` 를 늘린다.
- 관세환급 제품그룹 번호 → 본부는 `REFUND_HQ_CODES`. **새 번호는 추측해서 넣지 말고 기획자에게 먼저 묻는다.**
- 로그인 키트 사본(`js/auth.js` · `board.js` · `css/auth.css` · `board.css` · `kit-build.*`)은 여기서 직접 고치지 않는다(정본을 고친 뒤 apply-kit 를 다시 돌림).

## 하지 않는 것

- **실제 사내 자료 · 인증키를 저장소에 넣지 않는다.** 예제와 시험은 가짜 데이터로 만들고 「(가상)」을 붙인다. 공개 키(anon key) 말고 비밀 키 · 토큰은 넣지 않는다.
- 화면 숫자는 올린 파일에서 계산한다. 손으로 적은 값이나 0 나누기로 지어낸 값은 없다(null → 「—」).

## 이 PC에서

- node 가 PATH 에 없으면 `C:\Users\user\.aside\runtime\node\node.exe` 를 쓴다.
- 파일 줄끝은 CRLF.
