# tech.md — 논문 작성 서포터

> `/auto sync` 갱신. 마지막 갱신: 2026-07-11

## 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 데스크톱 셸 | Electron 33 + electron-builder 25 (portable) | 설치 없는 zip 배포, WebView2 의존 없음 |
| 언어 | TypeScript 5.7 strict (+noUncheckedIndexedAccess) | 파일 300줄 하드 리밋 |
| 렌더러 | React 18 + Vite 5 | 프로덕션 의존성은 react/react-dom 2개뿐 |
| 테스트 | Vitest 2.1 (+@vitest/coverage-v8@2) | node 환경 — .tsx 렌더 테스트 없음(로직 분리 패턴) |
| LLM 연동 | 내장 fetch로 REST 직접 호출 | **3사 SDK 미사용(의도) — 추가 금지** |
| 학술 API | KCI(공공데이터포털)·ScienceON(KISTI)·Semantic Scholar | mock 모드 내장, 실서버 스키마는 실키 확보 후 재확인 필요 |
| 키 저장 | Electron safeStorage (Windows DPAPI) | 같은 Windows 사용자만 복호화(의도된 제약) |

## 명령 (app/ 에서)

```
npm run typecheck   # tsc --noEmit (renderer/공용)
npm run build       # vite build + tsc -p tsconfig.main.json
npm test            # vitest run (unit + e2e 통합)
npm run dist        # electron-builder portable exe
npm run package     # dist + ../scripts/package-zip.mjs (배포 zip 조립)
```

⚠ electron-builder 최초 실행 시 winCodeSign 캐시의 darwin 심볼릭 링크 추출이
권한 문제로 실패할 수 있음 — 해결: 캐시 .7z를 `-x!darwin` 옵션으로 수동 추출
(2026-07-11 적용됨, 캐시는 사용자 프로필에 영구 보존).

## 테스트 현황 (Sprint 2 종료)

- 832개 통과 (unit 52파일 + e2e 17파일 — Sprint 1 종료 시 297개)
- Electron 진입점·React 컴포넌트는 여전히 자동화 0%(런타임 필요 — 실기기 수동 확인으로 보완, GUI 자동화는 백로그)

## 아키텍처 패턴

- 의존성 주입(core는 fetch/LLM/클라이언트/경로 전부 주입) → mock 테스트 용이
- 실패=결과값(Result) 규약, LLM 계층만 정규화 예외(LlmApiError 8종)
- 콜백 주입 UI(컴포넌트는 IPC 모름) + 순수 로직 파일 분리(xxxLogic.ts)
- 렌더러↔메인 타입 미러링(직접 import 대신) — 경계는 shared/
