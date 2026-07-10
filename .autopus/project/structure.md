# structure.md — 논문 작성 서포터

> `/auto sync` 갱신. 마지막 갱신: 2026-07-11

## 저장소 레이아웃 (= 배포 zip 레이아웃과 대응)

```
논문 작성 서포터/                 ← 저장소 루트 (배포 시 zip 루트)
├── 처음이라면_읽어주세요.html     ← 첫 사용자 안내 (SmartScreen 대처)
├── ARCHITECTURE.md · CHANGELOG.md
├── .autopus/                     ← 개발 아티팩트 (SPEC, 회의록) — 제품 아님
│   ├── project/                  (product·structure·tech·decisions)
│   └── specs/SPEC-TSA-001/       (prd·spec·plan·acceptance·research)
├── scripts/package-zip.mjs       ← 배포 zip 조립 스크립트
└── app/                          ← Electron 앱 본체
    ├── package.json              (스크립트: typecheck·build·test·dist·package)
    ├── electron-builder.yml      (Windows portable 타겟)
    ├── index.html                (CSP 포함)
    ├── src/
    │   ├── main/                 메인 프로세스
    │   │   ├── index.ts          부트스트랩(경로검사→설정→IPC→창)
    │   │   ├── paths.ts          ★ 경로 단일 소스 (data/·config/)
    │   │   ├── preload.ts        window.thesisApi 브리지
    │   │   ├── window.ts         BrowserWindow (isolation+sandbox)
    │   │   ├── startup/          pathCheck(+Dialog) — zip/임시폴더 감지
    │   │   ├── config/           settingsLoader·remoteConfig(화이트리스트)·
    │   │   │                     keyStore(DPAPI)·bundledKeys·defaultModels·defaultSettings
    │   │   └── ipc/              handlers(조립 루트)·llmService·academicClients·researchMapper
    │   ├── core/                 ★ UI 비의존 도메인 (전부 의존성 주입)
    │   │   ├── memory/           model·store(JSON)·serializer(결정론적 직렬화)
    │   │   ├── llm/              types·errors·3사 어댑터·index(팩토리)·
    │   │   │                     rateLimiter·retry·errorTranslator
    │   │   ├── academic-api/     types·kci·scienceon·semanticScholar·mockData
    │   │   ├── research-pipeline/ pipeline·queryGen·screening·report·types
    │   │   ├── chat/             conversation·compaction·types
    │   │   └── writing/          qualityGate·gateDefinitions
    │   ├── renderer/             React UI
    │   │   ├── App.tsx           첫실행 분기 + 탭(대화/서론 점검)
    │   │   ├── appCallbacks.ts   thesisApi → 화면 콜백 어댑터
    │   │   ├── chat/             ChatScreen·MessageList·ResearchProgress·
    │   │   │                     DecisionConfirmCard·chatUiLogic·markdownLite
    │   │   ├── settings/wizard/  4단계 마법사 (wizardLogic 분리)
    │   │   └── writing/          WritingCheckScreen·qualityGateView·gateViewLogic
    │   └── shared/               ipc-channels(7채널)·thesisApi·externalUrlPolicy·types
    └── test/
        ├── unit/                 20개 파일 (로직 단위)
        └── e2e/                  firstRun 3분할 + qualityGateIpc (모듈 통합)
```

## 런타임 생성 디렉터리 (배포 후)

- `data/` — keys.json(암호화), projects/default/memory.json, 백업(Sprint 2)
- `config/settings.json` — 사람이 읽을 수 있는 설정

## 진입점

- 메인: app/src/main/index.ts::bootstrap
- 렌더러: app/src/renderer/main.tsx → App.tsx
- IPC 조립: app/src/main/ipc/handlers.ts::registerIpcHandlers (@AX:ANCHOR)
