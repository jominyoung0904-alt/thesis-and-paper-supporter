# SPEC-TSA-002 구현 계획

**대상**: 논문 작성 서포터 Sprint 2 (Electron + TypeScript). 태스크 번호는 T36부터 시작한다(T1~T31은 SPEC-TSA-001에서 사용, T32~T35는 예비로 비워둠).

## 선행 리팩터링 메모 (300줄 제한 리스크)

`src/main/ipc/handlers.ts`는 현재 243줄, `src/shared/ipc-channels.ts`는 186줄이다. 이번 스프린트에서 5개 신규 도메인(프로젝트/보관함/리서치이력/대화이력/점검기록/글쓰기확장)의 IPC 채널·핸들러를 그대로 이 두 파일에 이어 붙이면 300줄 하드 리밋을 확실히 넘는다. 따라서 **T40을 최우선 기반 태스크로 두어 도메인별 파일 분리 구조를 먼저 확립**한다:

- `src/main/ipc/handlers.ts`는 `registerIpcHandlers` 조립부만 남기고, 각 신규 IPC 핸들러는 `src/main/ipc/{project,library,researchHistory,chatHistory,gateHistory,writingExt}Handlers.ts`로 분리.
- `src/shared/ipc-channels.ts`는 채널 이름 상수만 남기거나 도메인별 타입 파일(`src/shared/ipc-channels/{project,library,...}.ts`)로 나누고 barrel export.

이 분리는 파일 소유권 충돌(여러 태스크가 같은 파일을 동시에 수정) 방지에도 직접 기여한다.

## 태스크 목록

| Task ID | 설명 | 의존성 | 파일 소유권 | 규모 |
|---|---|---|---|---|
| T36 | 프로젝트 데이터 모델 + 인덱스 저장소(목록, activeId, archived) | 없음 | app/src/core/project/model.ts, projectStore.ts | M |
| T37 | 경로 레이아웃 확장(프로젝트별 서브패스 resolver) | 없음 | app/src/main/paths.ts(확장), app/src/main/project/projectPaths.ts | S |
| T38 | default 프로젝트 자동 마이그레이션(최초 1회, "내 연구 1") | T36, T37 | app/src/main/project/migration.ts | M |
| T39 | 서비스 재조립 계층(프로젝트 전환 시 MemoryStore·ConversationManager·보관함·리서치이력·점검기록 스토어 재생성) | T36, T37 | app/src/main/ipc/projectContext.ts | L |
| T40 | IPC 채널/핸들러 모듈 분리 기반 작업(300줄 리스크 선제 대응) | 없음 | app/src/shared/ipc-channels.ts(리팩터), app/src/main/ipc/handlers.ts(리팩터) | M |
| T41 | 프로젝트 관리 IPC(목록/생성/이름변경/전환/보관) | T39, T40 | app/src/main/ipc/projectHandlers.ts, app/src/shared/ipc-channels/project.ts | M |
| T42 | 프로젝트 전환 UI(상단 바) | T41 | app/src/renderer/project/ProjectSwitcher.tsx | M |
| T43 | 문헌 보관함 코어(모델 + JSON 저장소: PaperMetadata+저장일+출처리서치+메모) | T39 | app/src/core/library/model.ts, store.ts | M |
| T44 | 문헌 보관함 IPC(저장/목록/메모수정/삭제) | T43, T40 | app/src/main/ipc/libraryHandlers.ts, app/src/shared/ipc-channels/library.ts | M |
| T45 | 리서치 화면 저장 버튼(체크) + 보관함 화면 UI(목록/메모/삭제/링크) | T44 | app/src/renderer/research/*(확장), app/src/renderer/library/LibraryScreen.tsx | L |
| T46 | APA 서지 복사(국문/영문 간단 규칙, 클립보드) | T43 | app/src/core/library/bibliography.ts | S |
| T47 | 리서치 이력 코어(질문/리포트/citedPapers/relatedPapers 저장) | T39 | app/src/core/research-history/model.ts, store.ts | M |
| T48 | 딥리서치 완료 시 자동 저장 + 이력 조회 IPC | T47, T40 | app/src/main/ipc/researchHistoryHandlers.ts, app/src/shared/ipc-channels/researchHistory.ts | M |
| T49 | 리서치 이력 목록/재열람 UI | T48 | app/src/renderer/research/ResearchHistoryScreen.tsx | M |
| T50 | 회의하기 연계 코어(요약+참고문헌 summary 턴 주입, 토큰 예산) | T47 | app/src/core/chat/researchHandoff.ts | M |
| T51 | 회의하기 버튼 UI 연동(리서치 화면·이력 화면 공통) | T50, T49 | app/src/renderer/research/*(확장), app/src/renderer/chat/*(확장) | S |
| T52 | 대화 세션 코어(세션 목록+메시지 JSON 저장, 제목=첫질문요약) | T39 | app/src/core/chat/sessionStore.ts | M |
| T53 | 대화 자동저장 + 목록/불러오기/새대화 IPC | T52, T40 | app/src/main/ipc/chatHistoryHandlers.ts, app/src/shared/ipc-channels/chatHistory.ts | M |
| T54 | 대화 목록/이어하기/새대화 시작 UI | T53 | app/src/renderer/chat/ChatHistoryScreen.tsx, ChatScreen.tsx(확장) | M |
| T55 | 서론 점검 기록 코어(원고+GateResult+시각 저장) | T39 | app/src/core/writing/gateHistoryStore.ts | S |
| T56 | 점검 기록 IPC + 이력 목록 UI | T55, T40 | app/src/main/ipc/gateHistoryHandlers.ts, app/src/shared/ipc-channels/gateHistory.ts, app/src/renderer/writing/GateHistoryScreen.tsx | M |
| T57 | 문장 다듬기 기능 구현(국문/영문 학술 문체 교정+변경 사유) — T20 계승 | T39 | app/src/core/writing/polish.ts | M |
| T58 | 모의 심사 기능 구현(Reviewer 2 역할극) + 결과 저장 — T21 계승 | T39 | app/src/core/writing/mockReview.ts, mockReviewStore.ts | M |
| T59 | 다듬기/모의심사 IPC + 글쓰기 탭 UI 통합 | T57, T58, T40 | app/src/main/ipc/writingExtHandlers.ts, app/src/shared/ipc-channels/writingExt.ts, app/src/renderer/writing/*(확장) | M |
| T60 | 자동 백업 프로젝트별 구조 대응(PowerShell Compress-Archive 연동, 최근 5개 보관) — T26 계승 | T39 | app/src/main/backup/sessionBackup.ts | M |
| T61 | 딥리서치 체크포인트 프로젝트별 경로 반영 — T16 계승 | T39 | app/src/core/research-pipeline/checkpoint.ts | M |
| T62 | 탭 구성 재편(💬 대화 / 🔍 리서치 / 📚 보관함 / ✍️ 글쓰기 / ⚙️ 설정) | T42, T45, T49, T54, T59 | app/src/renderer/App.tsx | S |
| T63 | Sprint 2 E2E 시나리오 검증(프로젝트 전환→데이터 격리→각 기능) | 전체 | app/test/e2e/sprint2.spec.ts | L |

총 28개 태스크(T36~T63). 규모 표기: S(반나절 이내) / M(1~2일) / L(2~4일).

## Wave 편성 초안 (병렬 최대 5)

- **Wave 0** (병렬 2): T36, T37 — 프로젝트 모델과 경로 레이아웃은 서로 독립적이며 이후 모든 것의 전제조건.
- **Wave 1** (병렬 3): T38, T39, T40 — 마이그레이션과 서비스 재조립은 T36/T37에 의존하지만 서로 독립. T40(IPC 분리 기반)은 의존성이 없어 Wave 0과 병행해도 무방하나, 리뷰 편의상 Wave 1에 배치.
- **Wave 2** (병렬 5): T41, T43, T47, T52, T55 — 5개 도메인 코어/핸들러 착수. 전부 T39(+T40) 완료를 전제로 하며 서로 다른 파일만 건드려 충돌 없음.
- **Wave 3** (병렬 5): T42, T44, T48, T53, T56 — 각 도메인의 IPC 마무리 및 1차 UI.
- **Wave 4** (병렬 4): T45, T49, T54, T57 — UI 완성 트랙 + 문장 다듬기(독립 트랙이라 더 일찍 시작 가능하지만 병렬 슬롯 배분상 여기 배치).
- **Wave 5** (병렬 4): T46, T50, T58, T60 — 서지 복사, 회의하기 연계, 모의 심사, 백업.
- **Wave 6** (병렬 2): T51, T59 — 회의하기 UI 연동, 글쓰기 탭 통합(모의심사·다듬기 IPC 포함).
- **Wave 7** (병렬 2): T61, T62 — 체크포인트 경로 반영, 탭 구성 재편(다른 화면 완성 후 최종 배치).
- **Wave 8**: T63 — 전체 E2E.

## 구현 전략

- **최우선 기반**: 프로젝트 컨텍스트 전환(T39, 서비스 재조립)이 이번 스프린트 전체의 기반이다. T39 없이는 보관함/리서치이력/대화/점검기록 스토어 모두 "현재 프로젝트가 무엇인가"를 알 수 없으므로, 다른 도메인 코어 태스크(T43/T47/T52/T55)는 T39 완료 전에는 실질적으로 검증 불가능하다.
- **파일 소유권 충돌 회피**: handlers.ts·ipc-channels.ts에 여러 태스크가 몰리는 것을 T40에서 선제적으로 도메인별 파일로 쪼개어 방지한다(위 "선행 리팩터링 메모" 참조).
- **기존 코드 재사용**: MemoryStore의 원자적 저장 패턴(tmp파일 작성 후 rename, `app/src/core/memory/store.ts` save())을 library/research-history/chat-session/gate-history 스토어 4곳 모두 동일하게 복제한다. ConversationManager의 `restoreHistory`(app/src/core/chat/conversation.ts)를 대화 이어하기에 그대로 재사용한다.
- **변경 범위 통제**: core/ 레이어는 여전히 UI/Electron 비의존으로 유지하고, 프로젝트 컨텍스트는 main 계층(projectContext.ts)에서만 조립한다.
- **파일 크기 관리**: 각 스토어·핸들러 파일은 단일 도메인 책임만 지도록 나뉘어 있다. 구현 중 300줄 초과가 예상되면 즉시 하위 파일로 분리한다(예: writingExtHandlers.ts가 커지면 polish/mockReview 핸들러를 별도 파일로 분리).
- **병렬 실행 가능 태스크**: Wave 2~3의 5개 도메인 트랙(프로젝트/보관함/리서치이력/대화/점검기록)은 서로 다른 core 서브디렉터리와 별도 핸들러 파일만 건드리므로 완전히 독립적으로 병렬 진행 가능하다.

## 실행 기록 (Sprint 2 완료, 2026-07-11 sync)

Wave 0~8 전체 완료(T36~T63, 28개 태스크). 커밋 범위: `ec4d465`(Wave 0)~`d6ab09f`(Phase 4 수정), 이후 `ac06506`에서 @AX:ANCHOR 6개 태그.

- **Wave 0** ec4d465 — 프로젝트 모델·경로 레이아웃(T36/T37)
- **Wave 1** c5c98c2 — 마이그레이션·프로젝트 컨텍스트 재조립·IPC 도메인 분리 기반(T38/T39/T40)
- **Wave 2** 08d2467 — 5개 도메인 코어 + 프로젝트 관리 IPC(T41/T43/T47/T52/T55)
- **Wave 3** 72a1e1f — 도메인 IPC 4종 + 전환 UI + 중앙 배선(T42/T44/T48/T53/T56)
- **Wave 4** d285f44 — 보관함 화면·저장 버튼·리서치 이력·대화 사이드바·문장 다듬기 코어(T45/T49/T54/T57)
- **Wave 5** d467573 — APA 서지·회의 연계·모의 심사·자동 백업(T46/T50/T58/T60)
- **Wave 6** d6b873f — 회의하기 연동·글쓰기 4분할 통합 + 중앙 배선(T51/T59)
- **Wave 7** 0879824 — 딥리서치 체크포인트 이어하기 + 5탭 재편(T61/T62)
- **Wave 8** 76c31cb — 종합 E2E 6개 시나리오(T63)
- **AX 태깅** ac06506 — 아키텍처 요충지 @AX:ANCHOR 6개
- **Phase 4 수정** d6ab09f — 리뷰·보안 감사 발견 H1/H2 2건(하이) + M1/M2/M-1/L-1/I-1 다수 수정 (아래 참조)

테스트: Sprint 2 착수 시점(Wave 1, c5c98c2) 507/507 → Sprint 2 최종(Phase 4 수정 후, d6ab09f) 832/832. 전 구간 typecheck·build 통과.

Phase 4 리뷰·보안 감사에서 발견된 High 2건은 모두 이번 스프린트 내 수정 완료:
- H1: 리서치이력/대화세션/점검기록/모의심사 4개 스토어의 레코드 id에 대해 `core/persistence/recordId.ts`의 `isSafeRecordId`(UUID 문자셋 가드)를 핸들러 5곳 + 스토어 4곳 양쪽에 적용 — 손상된 렌더러가 `../` 등으로 임의 `.json`을 삭제하는 경로 탈출을 차단.
- H2: `research:run`/`quality-gate:run` 진입 시 프로젝트 스코프 경로(researchDir/checkpointFile/gateDir)를 1회 스냅샷 — 장시간 실행 중 프로젝트 전환이 발생해도 교차 프로젝트 오기록·체크포인트 오염이 없도록 차단.

M3(예외/결과값 반환 규약 통일)·M4(atomicWriteJson 중복 제거 DRY)는 의도적 백로그로 다음 스프린트에 이월(말단 스프린트 회귀 위험 대비 미용적 이득 낮음 판단).
