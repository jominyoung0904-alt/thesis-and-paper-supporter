# ARCHITECTURE — 논문 작성 서포터

> Sprint 2 (SPEC-TSA-002) 기준. `/auto sync`로 갱신됨. 마지막 갱신: 2026-07-11

## 전체 구조

Electron 포터블 앱. 3계층 + 공유 계약. Sprint 2에서 **프로젝트 컨텍스트 계층**(main/ipc/projectContext.ts)이 main과 core 사이에 추가되었다 — 여러 연구 프로젝트를 동시에 관리하기 위해, "현재 프로젝트"에 종속된 모든 서비스(메모리·보관함·리서치 이력·대화 세션·점검 기록 스토어)를 이 계층 하나가 조립·재조립한다.

```
┌─ renderer (React/Vite) ─────────────────────────────┐
│  App.tsx: 첫실행→Wizard, 이후 5탭                     │
│  (💬대화·🔍리서치·📚보관함·✍️글쓰기·⚙️설정)             │
│  chat/ · research/ · library/ · writing/ · project/  │
│  settings/wizard/                                    │
│  → window.thesisApi (preload 브리지)로만 메인과 통신   │
├─ shared ────────────────────────────────────────────┤
│  ipc-channels.ts(하위호환 re-export) → ipc/           │
│  {channels,common,llm,research,gate,academic,project, │
│   library,researchHistory,chatHistory,gateHistory,    │
│   researchHandoff,writingExt}.ts (도메인별 채널+타입,  │
│   index.ts가 barrel export) · thesisApi.ts ·          │
│  externalUrlPolicy.ts(https 허용목록)                 │
├─ main (Electron 메인 프로세스) ──────────────────────┤
│  index.ts 부트스트랩: 경로검사→paths→설정→IPC→창→      │
│  세션 백업(지연 기동, 아래 참조)                       │
│  startup/(zip·임시폴더 감지) config/(설정·원격·키·     │
│  번들키·모델)                                          │
│  project/(projectPaths resolver·default 마이그레이션) │
│  ipc/                                                 │
│    handlers.ts — registerIpcHandlers 조립 루트만 담당  │
│    projectContext.ts — ★ 프로젝트 전환 시 서비스       │
│      재조립(rebuild-on-switch)의 단일 소스             │
│    {project,library,researchHistory,chatHistory,      │
│     gateHistory,writingExt,researchHandoff,           │
│     academicKey,settings,chat,researchGate}Handlers.ts │
│      — 도메인별 IPC 핸들러(각 300줄 이내)              │
│    guards.ts/projectGuards.ts/academicKeyGuards.ts —   │
│      런타임 payload 검증                               │
│    llmService.ts·academicClients.ts·researchMapper.ts │
│  backup/sessionBackup.ts — 세션 시작 시 자동 백업       │
├─ core (UI 비의존 도메인 로직 — 전부 의존성 주입) ─────┤
│  project/(모델·프로젝트 인덱스 저장소)                  │
│  memory/(모델·JSON저장소·직렬화)                       │
│  library/(문헌 보관함 모델·저장소·APA 서지 포맷터)      │
│  research-history/(리서치 이력 모델·저장소, 상한 50)   │
│  chat/(대화·컴팩션·세션 모델/저장소·회의하기 핸드오프,  │
│    핸드오프 캡 8000자)                                 │
│  writing/(품질 게이트·점검 기록 저장소(상한 30)·        │
│    문장 다듬기·모의 심사(상한 30)/저장소)               │
│  persistence/recordId.ts — 레코드 id UUID 가드         │
│    (경로 탈출 방지, 스토어 4곳 공통)                    │
│  llm/(3사 어댑터·rate limiter·재시도·에러번역)          │
│  academic-api/(KCI·ScienceON·S2 + mock)                │
│  research-pipeline/(검색어→병렬조회→스크리닝→리포트→   │
│    체크포인트, 프로젝트별 경로)                         │
└──────────────────────────────────────────────────────┘
```

## 프로젝트 데이터 레이아웃

`data/projects/{projectId}/` 아래 프로젝트별로 완전히 격리되어 저장된다(projectId는 UUID):

```
data/
├── projects.json                 프로젝트 인덱스(목록·activeId·archived)
└── projects/{projectId}/
    ├── memory.json                연구 프로젝트 메모리
    ├── library.json               문헌 보관함
    ├── chats/{sessionId}.json     대화 세션(세션당 1파일)
    ├── research/{recordId}.json  리서치 이력(레코드당 1파일)
    │   └── checkpoint.json        딥리서치 진행 체크포인트
    └── gate/{recordId}.json       서론 점검·모의 심사 기록
```

기존 Sprint 1의 `data/projects/default/`는 최초 실행 시 `main/project/migration.ts`가 새 프로젝트 레코드("내 연구 1")로 1회만 자동 편입한다.

## 핵심 불변식 (위반 금지)

1. **경로**: data/·config/ 접근은 `main/paths.ts::resolveAppPaths`(+ `main/project/projectPaths.ts`의 프로젝트별 서브패스 resolver) 경유만. 레지스트리·AppData 금지 (포터블 원칙: 폴더 복사=백업).
2. **서지 결정론 (FR-RES-005)**: 참고문헌은 학술 API의 PaperMetadata로만 조립. LLM이 서지정보를 생성하는 경로 금지.
3. **실패=결과값**: config/·memory/·academic-api/·프로젝트 전환(SwitchResult)은 예외 대신 Result 객체 반환. 예외는 core/llm의 `LlmApiError`(정규화 8종)뿐이며 IPC 경계에서 `translateLlmError`로 한국어化.
4. **키 보호**: 평문 키는 디스크·로그·렌더러에 절대 노출 금지. safeStorage(DPAPI) 암호화, 연결 확인 성공 후에만 저장.
5. **원격 설정 검증**: endpoints 오버라이드는 https + 서비스별 호스트 화이트리스트 통과분만 병합(키 유출 차단).
6. **IPC 런타임 가드**: 모든 ipcMain.handle은 payload를 런타임 재검증(화이트리스트·길이 제한).
7. **renderer 격리**: contextIsolation+sandbox, preload 브리지 외 메인 접근 금지, CSP 적용, 외부 링크는 허용목록 검사 후 shell.openExternal.
8. **파일 300줄 하드 리밋** (소스 기준).
9. **레코드 id 가드 (Sprint 2, H1)**: 리서치이력·대화세션·점검기록·모의심사 4개 스토어는 `{id}.json` 경로 조립 전 `core/persistence/recordId.ts::isSafeRecordId`(UUID 문자셋)로 핸들러·스토어 양쪽에서 검증 — 어느 한쪽 우회로도 경로 탈출 불가.
10. **장시간 핸들러의 경로 스냅샷 (Sprint 2, H2)**: `research:run`·`quality-gate:run`처럼 실행 중 프로젝트 전환이 가능한 핸들러는 진입 시점에 프로젝트 스코프 경로를 1회 스냅샷하고, 실행 중 액세서를 재호출하지 않는다(교차 프로젝트 오기록 방지).

## 의존 방향

renderer → shared ← main → projectContext → core (core는 아무것도 모름 — LLM/클라이언트/경로 전부 주입). renderer↔main 타입은 shared가 유일한 접점. renderer가 core 타입을 import할 땐 읽기 전용(타입만). projectContext는 main 계층에만 존재하며 electron에 비의존(순수 Node)이라 단위 테스트 가능.

## 세션 백업 타이밍 (설계 편차)

자동 백업은 SPEC-TSA-001 설계 결정 6이 전제한 "세션 종료 시"가 아니라 **다음 세션 START 시(창 생성 3초 후, fire-and-forget)** 실행된다. Windows에서 `before-quit` 훅이 강제 종료 앞에서 신뢰할 수 없어(비동기 정리 핸들러가 완료 전 프로세스가 죽을 수 있음), zip 손상 위험이 낮은 시작 시점으로 이전했다(`main/backup/sessionBackup.ts` 모듈 문서 참조). `backups/`는 `data/`와 형제 디렉터리이며 최근 5개만 보관.

## 확장 지점 (후속 스프린트)

- 품질 게이트: `core/writing/gateDefinitions.ts` 맵에 섹션 추가
- 학술 키: `config/bundledKeys.ts` 실키 주입 또는 원격 academicKeys 배선(NFR-ACAPI-005)
- 모델명: `config/defaultModels.ts` → 원격 설정 로드(T27, 이연)
- 인용 형식 확장: `core/library/bibliography.ts`를 형식별 포맷터 인터페이스로 교체(BibTeX 등, FR-LIB-004)
- 백로그(M3/M4): 예외/결과값 반환 규약 통일, `atomicWriteJson` 저장 로직 공통화(persistence/ 레이어로 승격 검토)
