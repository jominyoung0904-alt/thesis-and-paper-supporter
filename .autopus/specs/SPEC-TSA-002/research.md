# SPEC-TSA-002 리서치

## 기존 코드 분석

### 서비스 조립 지점 (프로젝트 전환의 접합점)
- `app/src/main/ipc/handlers.ts::registerIpcHandlers`가 유일한 조립 루트다. 현재 `memoryFilePath: string` 단일 경로를 받아 `new MemoryStore(memoryFilePath)` 하나만 생성한다(80~96행).
- `buildConversationManager()`(90~96행)는 이미 "새 인스턴스를 만들고 이전 상태를 이관"하는 패턴을 갖고 있다: 106~152행의 `SETTINGS_SAVE_PROVIDER_AND_KEY` 핸들러가 프로바이더/모델 변경 시 `conversationManager = buildConversationManager(); conversationManager.restoreHistory(previousHistory);`로 재조립한다. 프로젝트 전환도 동일한 패턴(재조립 + 필요한 상태 이관)을 그대로 확장하면 된다.
- `app/src/main/index.ts` 69행에서 `memoryFilePath: join(paths.dataDir, 'projects', 'default', 'memory.json')`로 프로젝트 경로가 하드코딩되어 있다 — 이번 스프린트가 반드시 걷어내야 할 지점.

### 프로젝트별 저장소 패턴 재사용 대상
- `app/src/core/memory/store.ts::MemoryStore.save()`(102~108행)의 원자적 쓰기(tmp 파일 작성 → rename)가 이번에 새로 만드는 4개 스토어(보관함/리서치이력/대화세션/점검기록) 모두에 재사용할 표준 패턴이다.
- `MemoryStore.load()`(74~93행)의 손상 파일 복구 전략(파싱 실패 시 `.bak`로 보존하고 빈 상태로 폴백, 절대 throw하지 않음)도 동일하게 복제한다.

### 대화 이어하기
- `app/src/core/chat/conversation.ts::ConversationManager.restoreHistory(messages)`(94~97행)가 이미 "저장된 전사(transcript)를 통째로 주입"하는 인터페이스를 제공한다. 대화 세션 영속(FR-CHM-003)은 디스크에서 읽은 `ChatMessage[]`를 그대로 이 메서드에 넘기면 된다 — 새 복원 로직을 만들 필요가 없다.
- `getHistory()`(89~92행)는 매 턴 저장(FR-CHM-001)에 필요한 현재 전사 스냅샷을 제공한다.

### 경로 해석
- `app/src/main/paths.ts::resolveAppPaths`가 유일한 경로 계산 지점(포터블 원칙, ARCHITECTURE 불변식 1). 프로젝트별 서브패스(`data/projects/{id}/chats/`, `research/`, `gate/`)는 이 함수의 반환값(`AppPaths.dataDir`)을 기반으로 별도 헬퍼(`projectPaths.ts`)에서 계산해야 하며, `paths.ts` 자체의 시그니처는 바꾸지 않는다(기존 소비자 다수 — 고팬인 함수, 주석에 "high fan-in" 경고 있음).

### 탭 구조
- `app/src/renderer/App.tsx`는 `MainTab = 'chat' | 'writing' | 'settings'` 3탭 구조(32~33행)이며 `renderBody`가 조건부 렌더링한다(84~120행). 5탭으로 확장 시 동일한 `role="tablist"` 패턴을 유지하되, 상태 타입을 5개 값으로 확장하고 프로젝트 전환 UI는 탭 바 위(또는 옆)에 별도로 배치한다(탭 자체가 아님 — decisions 문서가 "상단에 프로젝트 전환 UI"라고 명시).

### 파일 크기 리스크
- `handlers.ts`(현재 243줄)와 `shared/ipc-channels.ts`(현재 186줄)는 이미 300줄 한도의 60~80%를 차지한다. 6개 신규 IPC 도메인(프로젝트/보관함/리서치이력/대화이력/점검기록/글쓰기확장)을 그대로 추가하면 확실히 초과한다 → plan.md T40에서 도메인별 파일 분리를 선행 과제로 명시함.

### 딥리서치 파이프라인 / 학술 API 타입
- `app/src/core/research-pipeline/pipeline.ts::runDeepResearch`가 `onProgress` 콜백(42행)을 이미 노출하므로 체크포인트 저장(NFR-OPS-002)은 이 콜백 지점에서 단계별 스냅샷을 쓰면 된다(SPEC-TSA-001 확장 지점 섹션에 이미 명시됨).
- `app/src/core/academic-api/types.ts::PaperMetadata`(19~29행)가 보관함(FR-LIB-001)과 리서치 이력(FR-RSH-001)이 그대로 저장할 서지 데이터 형태다 — 서지 결정론(FR-RES-005) 불변식을 유지하려면 보관함/이력 저장소도 이 타입을 손대지 않고 그대로 재사용해야 한다.

## 설계 결정

### 1. 프로젝트 전환 시 서비스 수명주기: 재조립 vs 인스턴스 맵
**결정: 재조립(rebuild-on-switch).** 후보 두 가지를 비교했다.
- (a) 재조립: 전환 시 이전 프로젝트의 MemoryStore/ConversationManager 등을 버리고 새로 생성. 이미 handlers.ts의 프로바이더 변경 로직이 이 패턴을 쓰고 있어 구현 일관성이 높고, 메모리 누수 위험이 없다.
- (b) 프로젝트별 인스턴스 맵(캐시): 전환마다 재로딩 비용을 피할 수 있지만, 열어둔 프로젝트 수만큼 인스턴스가 누적되어 퇴출(eviction) 정책이 별도로 필요하고, "동시에 여러 프로젝트를 열어둔 채 각각 백그라운드로 갱신" 같은 요구가 없는 이 앱에는 과도한 복잡도다.
프로젝트 전환은 사용자가 자주 반복하는 동작이 아니며(연구 3~4개 병행이지 초당 전환이 아님) JSON 파일 규모도 작아 재조립 비용은 체감되지 않는다. 대화는 저장 시점(설계 결정 2)에 이미 디스크에 반영되어 있으므로 재조립으로 인한 데이터 손실도 없다.

### 2. 대화 자동 저장 시점: 턴마다 vs 디바운스
**결정: 매 턴(assistant 응답 완료 직후) 즉시 저장.** 디바운스는 마지막 저장 이후 크래시가 나면 그 구간의 턴이 유실되는데, decisions 문서의 UX 원칙("저장을 잊어도 데이터가 남는다")과 정면으로 배치된다. 채팅은 턴당 호출 빈도가 낮고(무료 모드 rate limit이 분당 10~15회로 이미 상한을 걸어둠) 저장 자체는 로컬 JSON 쓰기라 비용이 무시할 만해, 디바운스로 얻을 성능 이득이 거의 없다.

### 3. APA 서지 규칙(국문/영문)
간단 규칙(확장 가능한 인터페이스, FR-LIB-004 대비)으로 시작한다:
- 저자 3인 이하: 전원 표기(국문 "홍길동, 김철수", 영문 "Hong, G., & Kim, C.").
- 저자 4인 이상: 국문은 "홍길동 외", 영문은 "Hong, G., et al."
- 국문/영문 판별은 `PaperMetadata.title` 또는 첫 저자명에 한글(Hangul) 유니코드 범위 포함 여부로 휴리스틱 분기(리서치 파이프라인의 `normalizeTitle`이 이미 `\p{P}\p{S}` 유니코드 프로퍼티 정규식을 쓰고 있어 동일 스타일 재사용).
- 형식: `저자 (연도). 제목. 학술지/venue.` — venue가 null이면 생략, url이 있으면 말미에 추가.

### 4. 컨텍스트 주입 토큰 예산(회의하기, 무료 모드)
`app/src/core/chat/compaction.ts::APPROX_CHARS_PER_TOKEN = 2.5` 휴리스틱을 그대로 재사용한다. 리포트 원문 전체가 아니라 (a) LLM 생성 요약 1~2문단 + (b) `citedPapers` 상위 10편의 제목/저자/연도만 summary 턴에 담아, 총 문자 수를 무료 모드 기준 약 2,000토큰(≈5,000자) 이내로 제한한다. 예산 초과 시 인용 문헌 수를 줄이는 방향으로 트리밍한다(요약 문단은 유지). 이는 Context7 문서 정책의 "trimming priority" 원칙(API/설정 정보 우선, 서론성 콘텐츠 후순위)과 동일한 방향이다.

### 5. 백업 zip 생성 방식
`app/package.json`을 확인한 결과 런타임 dependencies는 `react`/`react-dom`뿐이고 `electron-builder`는 devDependency로 패키징 시에만 쓰이며 런타임에 zip 유틸리티로 재사용할 수 없다(archiver/adm-zip류 라이브러리도 미설치). 이 앱은 이미 Windows 전용 전제(safeStorage DPAPI 암호화, SmartScreen 안내)이므로, 새 런타임 의존성을 추가하는 대신 **`child_process`로 PowerShell의 `Compress-Archive` cmdlet을 호출**하는 방식을 채택한다(SPEC-TSA-001 T26 sessionBackup.ts가 이미 이 구조를 전제하고 있었다면 그대로, 아니라면 이번에 확정). 실패 시(PowerShell 부재 등) "실패=결과값" 불변식에 따라 예외 대신 Result 객체로 실패를 반환하고 백업 없이 앱 종료를 계속 진행한다.

## 리스크 / 후속 확인 필요

- `app/src/main/backup/` 디렉터리가 SPEC-TSA-001에서 실제로 구현되었는지는 코드베이스에 아직 존재하지 않음(Glob 결과 없음) — T26이 Sprint 1에서 미착수 상태로 보이며, 이번 T60이 사실상 최초 구현이 될 가능성이 높다. 구현 착수 시 재확인 필요.
- `app/src/core/writing/`에는 현재 `gateDefinitions.ts`, `qualityGate.ts`만 존재하고 `polish.ts`/`mockReview.ts`는 없다 — T57/T58도 마찬가지로 최초 구현이다.
