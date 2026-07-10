# structure.md — 논문 작성 서포터

> `/auto sync` 갱신. 마지막 갱신: 2026-07-11 (Sprint 2, SPEC-TSA-002)

## 저장소 레이아웃 (= 배포 zip 레이아웃과 대응)

```
논문 작성 서포터/                 ← 저장소 루트 (배포 시 zip 루트)
├── 처음이라면_읽어주세요.html     ← 첫 사용자 안내 (SmartScreen 대처)
├── ARCHITECTURE.md · CHANGELOG.md
├── .autopus/                     ← 개발 아티팩트 (SPEC, 회의록) — 제품 아님
│   ├── project/                  (product·structure·tech·decisions)
│   └── specs/SPEC-TSA-001, SPEC-TSA-002/  (spec·plan·acceptance·research)
├── scripts/package-zip.mjs       ← 배포 zip 조립 스크립트
└── app/                          ← Electron 앱 본체
    ├── package.json              (스크립트: typecheck·build·test·dist·package)
    ├── electron-builder.yml      (Windows portable 타겟)
    ├── index.html                (CSP 포함)
    ├── src/
    │   ├── main/                 메인 프로세스
    │   │   ├── index.ts          부트스트랩(경로검사→설정→IPC→창→세션 백업)
    │   │   ├── paths.ts          ★ 경로 단일 소스 (data/·config/)
    │   │   ├── preload.ts        window.thesisApi 브리지
    │   │   ├── window.ts         BrowserWindow (isolation+sandbox)
    │   │   ├── startup/          pathCheck(+Dialog) — zip/임시폴더 감지
    │   │   ├── config/           settingsLoader·remoteConfig(화이트리스트)·
    │   │   │                     keyStore(DPAPI)·bundledKeys·defaultModels·defaultSettings
    │   │   ├── project/          projectPaths(프로젝트별 서브패스 resolver)·migration(default 1회 편입)
    │   │   ├── backup/           sessionBackup(세션 시작 시 zip, 최근 5개 보관)
    │   │   └── ipc/              handlers(조립 루트만)·projectContext(★ 재조립)·
    │   │                         {project,library,researchHistory,chatHistory,
    │   │                         gateHistory,writingExt,researchHandoff,academicKey,
    │   │                         settings,chat,researchGate}Handlers·
    │   │                         guards/projectGuards/academicKeyGuards(런타임 검증)·
    │   │                         llmService·academicClients·researchMapper
    │   ├── core/                 ★ UI 비의존 도메인 (전부 의존성 주입)
    │   │   ├── project/          model·projectStore(인덱스: 목록·activeId·archived)
    │   │   ├── memory/           model·store(JSON)·serializer(결정론적 직렬화)
    │   │   ├── library/          model·store(문헌 보관함)·bibliography(APA 서지)
    │   │   ├── research-history/ model·store(리서치 이력, 상한 50)
    │   │   ├── chat/             conversation·compaction·types·
    │   │   │                     sessionModel·sessionStore(대화 세션)·researchHandoff(핸드오프, 8000자 캡)
    │   │   ├── writing/          qualityGate·gateDefinitions·gateHistoryStore(상한 30)·
    │   │   │                     polish(문장 다듬기)·mockReview·mockReviewStore(상한 30)
    │   │   ├── persistence/      recordId(레코드 id UUID 가드, 스토어 4곳 공통)
    │   │   ├── llm/              types·errors·3사 어댑터·index(팩토리)·
    │   │   │                     rateLimiter·retry·errorTranslator
    │   │   ├── academic-api/     types·kci·scienceon·semanticScholar·mockData
    │   │   └── research-pipeline/ pipeline·queryGen·screening·report·checkpoint(프로젝트별 경로)·types
    │   ├── renderer/             React UI
    │   │   ├── App.tsx           첫실행 분기 + 5탭(💬대화·🔍리서치·📚보관함·✍️글쓰기·⚙️설정)
    │   │   ├── appCallbacks.ts   thesisApi → 화면 콜백 어댑터
    │   │   ├── project/          ProjectSwitcher(전환·생성·이름변경·보관 UI, 5개 파일)
    │   │   ├── chat/             ChatScreen·MessageList·ResearchProgress·
    │   │   │                     DecisionConfirmCard·ChatHistoryScreen(목록/이어하기/새대화)·
    │   │   │                     chatUiLogic·markdownLite (21개 파일)
    │   │   ├── research/         ResearchHistoryScreen(이력 목록/재열람)·회의하기 버튼 연동
    │   │   ├── library/          LibraryScreen(목록·메모·삭제·링크·APA 복사)
    │   │   ├── settings/wizard/  4단계 마법사 (wizardLogic 분리)
    │   │   └── writing/          WritingScreen(4분할: 점검·다듬기·모의심사·기록, 18개 파일)
    │   └── shared/               ipc-channels(하위호환 re-export)·ipc/(도메인별 채널+타입,
    │                             13개 파일 + index barrel)·thesisApi·externalUrlPolicy·types
    └── test/
        ├── unit/                 52개 파일 (로직 단위)
        └── e2e/                  firstRun 3분할·qualityGateIpc·projectManagementIpc·
                                   libraryIpc·researchHistoryIpc·researchHandoffIpc·
                                   chatHistoryIpc·gateHistoryIpc·writingExtIpc(+History)·
                                   researchGateRace·sprint2(종합 6시나리오) — 17개 파일
```

## 런타임 생성 디렉터리 (배포 후)

- `data/projects.json` — 프로젝트 인덱스(목록·activeId·archived)
- `data/projects/{projectId}/` — memory.json·library.json·chats/·research/(+checkpoint.json)·gate/ (프로젝트별 완전 격리)
- `backups/` — 세션 시작 시 자동 백업 zip, 최근 5개 보관 (`data/`와 형제 디렉터리)
- `config/settings.json` — 사람이 읽을 수 있는 설정

## 진입점

- 메인: app/src/main/index.ts::bootstrap
- 렌더러: app/src/renderer/main.tsx → App.tsx
- IPC 조립: app/src/main/ipc/handlers.ts::registerIpcHandlers (@AX:ANCHOR)
- 프로젝트 컨텍스트: app/src/main/ipc/projectContext.ts (전환 시 서비스 재조립, @AX:ANCHOR)
