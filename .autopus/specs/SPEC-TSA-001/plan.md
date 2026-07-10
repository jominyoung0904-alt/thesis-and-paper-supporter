# SPEC-TSA-001 구현 계획

**대상**: 논문 작성 서포터 1단계 MVP (Electron + TypeScript, 그린필드)

## 제안 디렉터리 구조

```
app/
  src/
    main/                     Electron 메인 프로세스
      index.ts
      window.ts
      ipc/                    렌더러-메인 IPC 채널 핸들러
      startup/                실행 경로 검사, 쓰기 권한 테스트, 경로 안내
      config/                 settings.json 로더, 원격 endpoints.json 페처, 키 저장소
      backup/                 자동 백업
    renderer/                 UI (React 등 SPA)
      chat/                   단일 채팅 인터페이스
      memory/                 프로젝트 메모리 조회/편집 화면
      research/               딥리서치 결과/체크포인트 UI
      writing/                품질 게이트, 문장 다듬기, 모의 심사, 인용 링크
      settings/               설정 마법사, 학술 키 등록, 진단 화면, 사용액 표시
    core/                     메인 프로세스에서 구동되는 도메인 로직 (UI 비의존)
      chat/                   채팅 아이디어 회의 (대화 관리, 컴팩션)
      memory/                 프로젝트 메모리 코어 (JSON 저장/조회/직렬화)
      llm/                    Claude/Gemini/OpenAI 어댑터, rate limiter, 오류 번역, 모델 레지스트리
      academic-api/           KCI, ScienceON, Semantic Scholar 클라이언트
      research-pipeline/      검색어 생성 -> 병렬 조회 -> 스크리닝 -> 리포트 -> 체크포인트
      writing/                품질 게이트, 문장 다듬기, 모의 심사
      export/                 키 제외 내보내기
    shared/                   공용 타입, IPC 채널 명세, 상수
  test/
    unit/
    e2e/
  package.json
  tsconfig.json
  electron-builder.yml        portable 타겟 빌드 설정
```

파일당 300줄 제한을 준수하기 위해 각 core 서브디렉터리 내부는 기능 단위(예: llm/claudeAdapter.ts, llm/geminiAdapter.ts, llm/openaiAdapter.ts)로 분리한다.

## 태스크 목록

| Task ID | 설명 | 의존성 | 파일 소유권 | 예상 규모 |
|---|---|---|---|---|
| T1 | Electron+TypeScript 프로젝트 스캐폴딩, portable 빌드 타겟 설정 | 없음 | package.json, tsconfig.json, electron-builder.yml | M |
| T2 | 실행 경로 검사(zip 내부/임시 폴더 감지, 리스크 2) | T1 | src/main/startup/pathCheck.ts | S |
| T3 | SmartScreen 안내 HTML 작성(리스크 1) | 없음 | 처음이라면_읽어주세요.html | S |
| T4 | config/settings.json 로더 + 원격 endpoints.json 페처 + 폴백 | T1 | src/main/config/settingsLoader.ts, remoteConfig.ts | M |
| T5 | 쓰기 권한 테스트(리스크 6) | T1 | src/main/startup/writeTest.ts | S |
| T6 | LLM 어댑터 계층(Claude/Gemini/OpenAI 공통 인터페이스) | T4 | src/core/llm/adapter.ts, claudeAdapter.ts, geminiAdapter.ts, openaiAdapter.ts | L |
| T7 | 무료 모드 rate limiter | T6 | src/core/llm/rateLimiter.ts | S |
| T8 | API 오류 한국어 번역 + 자동 재시도(리스크 3) | T6 | src/core/llm/errorTranslator.ts | M |
| T9 | 최초 실행 설정 마법사 UI(제공자 선택, 키 입력, 학술 키 등록) | T6, T4 | src/renderer/settings/wizard/ | L |
| T10 | API 키 로컬 암호화 저장 | T1 | src/main/config/keyStore.ts | S |
| T11 | 프로젝트 메모리 코어(데이터 모델 + JSON 저장소) | T1 | src/core/memory/store.ts, model.ts | M |
| T12 | 메모리 프롬프트 프리픽스 직렬화(캐시 친화적) | T11 | src/core/memory/serializer.ts | S |
| T13 | 학술 API 클라이언트(KCI/ScienceON/Semantic Scholar) + 내장 공용 키 | T4 | src/core/academic-api/kciClient.ts, scienceOnClient.ts, semanticScholarClient.ts | L |
| T14 | ScienceON 토큰 자동 갱신(2시간 만료 대응) | T13 | src/core/academic-api/scienceOnAuth.ts | S |
| T15 | 딥리서치 파이프라인(검색어 생성 -> 병렬 조회 -> 스크리닝 -> 리포트) | T6, T12, T13 | src/core/research-pipeline/pipeline.ts, screening.ts, report.ts | L |
| T16 | 딥리서치 체크포인트 저장/재개 | T15 | src/core/research-pipeline/checkpoint.ts | M |
| T17 | 채팅 UI(단일 인터페이스로 전 기능 접근) | T9 | src/renderer/chat/ | L |
| T18 | 서론 품질 게이트 체크리스트 | T12 | src/core/writing/qualityGate.ts | M |
| T19 | 완료 차단/경고 UI 연동 | T18 | src/renderer/writing/qualityGateView.tsx | S |
| T20 | 학술 문장 다듬기 기능 | T6 | src/core/writing/polish.ts | M |
| T21 | 모의 심사(Reviewer 2, 단일 모델 역할극) 기능 | T6, T12 | src/core/writing/mockReview.ts | M |
| T22 | 인용 클릭 -> 원문 링크 연동 | T15 | src/renderer/writing/citationLink.tsx | S |
| T23 | 키 제외 내보내기 기능(리스크 4) | T10, T11 | src/core/export/exportWithoutKeys.ts | S |
| T24 | 연결 진단 화면(리스크 7) | T4 | src/renderer/settings/diagnostics.tsx | M |
| T25 | OneDrive/바탕화면 경로 감지 안내(리스크 5) | T2 | src/main/startup/pathAdvisory.ts | S |
| T26 | 자동 백업(세션 종료 시, 최근 5개 보관, 리스크 10) | T11 | src/main/backup/sessionBackup.ts | M |
| T27 | 모델명 원격 관리 연동(리스크 9) | T4, T6 | src/core/llm/modelRegistry.ts | S |
| T28 | 월 사용액 표시/상한 알림 | T6 | src/renderer/settings/usage.tsx | M |
| T29 | 최초 실행 E2E 시나리오 검증(zip 해제 -> 마법사 -> 딥리서치 -> 집필) | 전체 | test/e2e/firstRun.spec.ts | L |
| T30 | 채팅 아이디어 회의(자유 대화 관리, 메모리 컨텍스트 주입, 대화 컴팩션, 결정 저장 연동) | T6, T11, T12 | src/core/chat/conversation.ts, compaction.ts | M |
| T31 | 무료 모드 일일 사용량 추적 + 딥리서치 실행 전 잔량 사전 안내 | T7 | src/core/llm/quotaTracker.ts | S |

총 31개 태스크. 규모 표기: S(작음, 반나절 이내) / M(중간, 1~2일) / L(큼, 2~4일). T17(채팅 UI)은 T30의 대화 관리 로직을 사용한다.

## 구현 전략

- **의존성 순서**: T1(스캐폴딩) -> T4/T6/T11/T13(핵심 인프라: 설정, LLM 어댑터, 메모리, 학술 API) -> T15/T18(파이프라인 조립) -> T9/T17(UI 통합) -> T2/T3/T5/T8(리스크 1~3 MVP 필수 항목은 T1 직후 병행 가능하도록 별도 트랙으로 진행) -> T29(E2E 검증).
- **MVP 우선순위 반영**: spec.md의 P0 요구사항(FR-MEM-001~004, FR-RES-001~006, FR-WRT-001~002, NFR-DEP-*, NFR-LLM-001~004, NFR-ACAPI-001, NFR-CFG-001)을 커버하는 태스크(T1~T20 중 P0 대응분)를 1차 스프린트로 묶는다. P1/P2 대응 태스크(T21~T28 일부)는 후속 스프린트로 미룬다.
- **기존 코드 활용**: 그린필드 프로젝트이므로 재사용 가능한 기존 코드는 없다. 대신 오픈소스 라이브러리(예: Electron, electron-builder, LLM 공식 SDK, KCI/ScienceON REST 클라이언트 직접 구현)를 최대한 활용해 개발 범위를 줄인다.
- **변경 범위 통제**: core/ 레이어는 UI(main/renderer)에 비의존적으로 설계하여 향후 2단계(PDF RAG, Zotero 연동) 확장 시 core 인터페이스를 재사용할 수 있게 한다.
- **파일 크기 관리**: 각 태스크의 파일 소유권은 단일 책임 원칙에 따라 나뉘어 있으며, 구현 중 300줄을 초과할 것으로 예상되면 즉시 하위 파일로 분리한다(예: llm/adapter.ts가 커지면 프로바이더별 파일로 완전히 위임).
- **병렬 실행 가능 태스크**: T2, T3, T5(리스크 1/2/6)는 서로 독립적이며 T1 완료 후 병렬 진행 가능. T13(학술 API 3종 클라이언트)도 내부적으로 KCI/ScienceON/Semantic Scholar 3개 서브태스크로 병렬화 가능.
