# ARCHITECTURE — 논문 작성 서포터

> Sprint 1 (SPEC-TSA-001) 기준. `/auto sync`로 갱신됨. 마지막 갱신: 2026-07-11

## 전체 구조

Electron 포터블 앱. 3계층 + 공유 계약:

```
┌─ renderer (React/Vite) ─────────────────────────────┐
│  App.tsx: 첫실행→Wizard, 이후 탭(대화/서론 점검)      │
│  chat/ · settings/wizard/ · writing/                 │
│  → window.thesisApi (preload 브리지)로만 메인과 통신   │
├─ shared ────────────────────────────────────────────┤
│  ipc-channels.ts(7채널+타입) · thesisApi.ts ·        │
│  externalUrlPolicy.ts(https 허용목록)                 │
├─ main (Electron 메인 프로세스) ──────────────────────┤
│  index.ts 부트스트랩: 경로검사→paths→설정→IPC→창      │
│  startup/(zip·임시폴더 감지) config/(설정·원격·키·     │
│  번들키·모델) ipc/(핸들러 조립·학술클라이언트·          │
│  LLM서비스·매퍼) preload.ts                          │
├─ core (UI 비의존 도메인 로직 — 전부 의존성 주입) ─────┤
│  memory/(모델·JSON저장소·직렬화) llm/(3사 어댑터·      │
│  rate limiter·재시도·에러번역) academic-api/(KCI·     │
│  ScienceON·S2 + mock) research-pipeline/(검색어→     │
│  병렬조회→스크리닝→리포트) chat/(대화·컴팩션)          │
│  writing/(품질 게이트)                                │
└──────────────────────────────────────────────────────┘
```

## 핵심 불변식 (위반 금지)

1. **경로**: data/·config/ 접근은 `main/paths.ts::resolveAppPaths` 경유만. 레지스트리·AppData 금지 (포터블 원칙: 폴더 복사=백업).
2. **서지 결정론 (FR-RES-005)**: 참고문헌은 학술 API의 PaperMetadata로만 조립. LLM이 서지정보를 생성하는 경로 금지.
3. **실패=결과값**: config/·memory/·academic-api/는 예외 대신 Result 객체 반환. 예외는 core/llm의 `LlmApiError`(정규화 8종)뿐이며 IPC 경계에서 `translateLlmError`로 한국어化.
4. **키 보호**: 평문 키는 디스크·로그·렌더러에 절대 노출 금지. safeStorage(DPAPI) 암호화, 연결 확인 성공 후에만 저장.
5. **원격 설정 검증**: endpoints 오버라이드는 https + 서비스별 호스트 화이트리스트 통과분만 병합(키 유출 차단).
6. **IPC 런타임 가드**: 모든 ipcMain.handle은 payload를 런타임 재검증(화이트리스트·길이 제한).
7. **renderer 격리**: contextIsolation+sandbox, preload 브리지 외 메인 접근 금지, CSP 적용, 외부 링크는 허용목록 검사 후 shell.openExternal.
8. **파일 300줄 하드 리밋** (소스 기준).

## 의존 방향

renderer → shared ← main → core (core는 아무것도 모름 — LLM/클라이언트/경로 전부 주입). renderer↔main 타입은 shared가 유일한 접점. renderer가 core 타입을 import할 땐 읽기 전용(타입만).

## 확장 지점 (Sprint 2)

- 품질 게이트: `main/ipc/handlers.ts::GATE_DEFINITIONS` 맵에 섹션 추가
- 학술 키: `config/bundledKeys.ts` 실키 주입 또는 원격 academicKeys 배선(NFR-ACAPI-005)
- 모델명: `config/defaultModels.ts` → 원격 설정 로드(T27)
- 딥리서치 체크포인트: `research-pipeline`의 onProgress 이벤트가 접합점(T16)
