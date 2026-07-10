---
id: SPEC-TSA-002
title: 논문 작성 서포터 Sprint 2 — 프로젝트 관리 중심 기능 확장
status: implemented
created: 2026-07-11
domain: TSA
source:
  - .autopus/project/decisions-2026-07-11-sprint2.md
  - .autopus/specs/SPEC-TSA-001/spec.md
---

# SPEC-TSA-002: 논문 작성 서포터 Sprint 2 — 프로젝트 관리 중심 기능 확장

**Status**: implemented (Sprint 2 — 2026-07-11 sync 완료; 실행 기록은 plan.md 하단 참조)
**Created**: 2026-07-11
**Domain**: TSA (Thesis Support App)

## 목적

Sprint 1(SPEC-TSA-001) 앱이 실기기에서 종단 동작(마법사→Gemini→딥리서치→참고문헌 링크)을 확인받았다. 그러나 사용자는 연구를 동시에 3~4개 병행하는데 현재 앱은 단일 프로젝트(`data/projects/default`)로 고정되어 있어 연구별 데이터 분리가 불가능하다. 이번 Sprint는 **프로젝트 관리**를 중심 설계로 도입하여 모든 영속 데이터(메모리, 보관함, 대화, 리서치 이력, 점검 기록)를 프로젝트 단위로 격리하고, 이를 기반으로 사용자 피드백 ④~⑦ 및 승인된 추천 4종(서지 복사, 리서치 이력, 모의 심사, 문장 다듬기)과 기존 P1 잔여 항목(자동 백업, 딥리서치 체크포인트)을 함께 완결한다.

## 설계 결정 (불명확 지점에 대한 제안 — 근거 1줄, research.md 상세)

1. 프로젝트 컨텍스트 전환 방식: **재조립(rebuild-on-switch)**. handlers.ts가 이미 프로바이더 변경 시 ConversationManager를 재생성하는 패턴(`buildConversationManager` 재호출 + `restoreHistory`)을 갖고 있어 일관성이 높고, 프로젝트 전환은 빈도가 낮은 동작이라 재구축 비용이 무시할 만하다.
2. 대화 자동 저장 시점: **매 턴(assistant 응답 완료 직후) 즉시 저장**. "저장을 잊어도 데이터가 남는다"는 UX 원칙에 가장 직접적으로 부합하며, 디바운스는 크래시 시 유실 구간을 남기고 구현 복잡도만 늘린다.
3. 탭 재구성: decisions 문서가 제시한 **💬 대화 / 🔍 리서치(이력 포함) / 📚 보관함 / ✍️ 글쓰기(서론 점검+다듬기+모의 심사 통합) / ⚙️ 설정** 5탭 안을 채택. 5개 기능 도메인과 1:1 대응되어 인지 부담이 낮다. (최종 레이블/배치는 UI 구현 중 보류 — 아래 "보류" 참조)
4. 프로젝트 삭제: **보관(soft-delete, `archived: true`) 방식**. decisions 문서가 "데이터 소중함을 고려해 보관 우선"이라 명시했다.
5. 백업 zip 생성: Node 런타임에 zip 라이브러리가 없다(package.json에 archiver/adm-zip 미포함, electron-builder는 devDependency로 런타임 사용 불가). **PowerShell `Compress-Archive`를 자식 프로세스로 재사용**한다 — 이미 Windows 포터블/DPAPI 전제인 앱이라 추가 런타임 의존성 없이 해결 가능하다.
6. 회의하기(리서치→채팅) 컨텍스트 예산: 리포트 원문 전체가 아니라 **요약 + 인용 문헌 상위 N편(제목/저자/연도만)**을 summary 턴으로 주입, 기존 `compaction.ts`의 문자당 토큰 근사치(2.5자/토큰)를 재사용해 상한을 계산한다.

## 요구사항

우선순위 표기: P0 = 이번 스프린트 1차 목표(필수), P1 = 스프린트 내 후속(핵심 기능이나 순연 가능), P2 = 부가/확장.

### 1. 프로젝트 관리 (FR-PRJ)

- FR-PRJ-001 [P0]: THE SYSTEM SHALL 여러 연구 프로젝트를 생성하고 각 프로젝트의 영속 데이터를 `data/projects/{projectId}/` 하위(memory.json, library.json, chats/, research/, gate/)에 격리하여 저장한다.
- FR-PRJ-002 [P0]: WHEN 사용자가 프로젝트 전환 UI에서 다른 프로젝트를 선택하면, THE SYSTEM SHALL 메모리·보관함·대화·리서치 이력·점검 기록을 다루는 서비스 전체를 선택된 프로젝트 기준으로 재조립하고, 전환 전 프로젝트의 데이터가 화면에 남아 노출되지 않게 한다.
- FR-PRJ-003 [P0]: WHEN 앱이 이번 스프린트 반영 이후 최초로 실행되고 `data/projects/default/` 아래 Sprint 1 시절 데이터가 존재하면, THE SYSTEM SHALL 이를 새 프로젝트 레코드(예: "내 연구 1")로 자동 편입하고, 이후 재실행 시 동일 마이그레이션을 다시 수행하지 않는다.
- FR-PRJ-004 [P1]: THE SYSTEM SHALL 프로젝트 이름 변경을 지원한다.
- FR-PRJ-005 [P1]: WHEN 사용자가 프로젝트 삭제를 요청하면, THE SYSTEM SHALL 데이터를 물리적으로 삭제하지 않고 보관(숨김) 상태로 전환하여 프로젝트 전환 목록에서 제외한다.
- FR-PRJ-006 [P0]: THE SYSTEM SHALL 프로젝트 전환을 한 번의 클릭으로 수행할 수 있게 하며, 전환 후에도 가능한 한 이전에 보던 화면(탭)을 유지한다.

### 2. 문헌 보관함 (FR-LIB) — 사용자 피드백 ④

- FR-LIB-001 [P0]: WHEN 사용자가 리서치 결과(참고문헌/관련문헌) 항목의 저장 버튼(체크)을 선택하면, THE SYSTEM SHALL 해당 PaperMetadata 전체와 저장일, 출처 리서치 식별자를 현재 프로젝트의 보관함에 저장한다.
- FR-LIB-002 [P0]: THE SYSTEM SHALL 보관함 화면에서 저장된 문헌의 목록 조회, 메모(한 줄) 작성/수정, 삭제, 원문 링크 열기를 제공한다.
- FR-LIB-003 [P1]: WHEN 사용자가 보관함에서 문헌을 선택해 서지 복사를 요청하면, THE SYSTEM SHALL 선택된 문헌들을 APA 형식 텍스트로 클립보드에 복사하며, 국문 문헌과 영문 문헌에 각각 맞는 표기 규칙(저자 표기, 소속 언어)을 적용한다.
- FR-LIB-004 [P2]: WHERE 향후 다른 인용 형식(BibTeX 등)이 요구될 때, THE SYSTEM SHALL 서지 포맷터를 형식별로 교체 가능한 인터페이스로 제공한다.

### 3. 리서치 이력·연계 (FR-RSH) — 사용자 피드백 ⑤, 추천 항목

- FR-RSH-001 [P1]: WHEN 딥리서치가 완료되면, THE SYSTEM SHALL 질문·리포트·citedPapers·relatedPapers를 현재 프로젝트의 리서치 이력에 자동 저장한다.
- FR-RSH-002 [P1]: THE SYSTEM SHALL 리서치 이력 목록에서 과거 리서치 결과를 다시 열람할 수 있게 하며, 열람 화면에서도 문헌 보관함 저장과 회의하기를 동일하게 수행할 수 있게 한다.
- FR-RSH-003 [P1]: WHEN 사용자가 리서치 결과 화면(또는 이력 열람 화면)에서 "이 결과로 회의하기"를 선택하면, THE SYSTEM SHALL 리포트 요약과 참고문헌 목록을 summary 턴으로 주입한 새 대화를 채팅 모드에서 시작한다.
- FR-RSH-004 [P1]: WHILE 회의하기로 새 대화가 시작되는 동안, THE SYSTEM SHALL 무료 모드 rate limit과 토큰 예산을 고려하여 주입되는 컨텍스트 크기를 제한한다(설계 결정 6).

### 4. 대화 기록 영속 (FR-CHM) — 사용자 피드백 ⑥

- FR-CHM-001 [P0]: THE SYSTEM SHALL 채팅 아이디어 회의 대화를 프로젝트별로 자동 저장하며, 사용자가 별도로 저장 버튼을 누르지 않아도 데이터가 보존되게 한다(설계 결정 2: 매 턴 저장).
- FR-CHM-002 [P0]: THE SYSTEM SHALL 대화 목록 UI에서 각 대화의 제목(첫 질문 요약)과 날짜를 표시한다.
- FR-CHM-003 [P0]: WHEN 사용자가 목록에서 대화를 선택하면, THE SYSTEM SHALL 해당 대화의 이력을 복원(`restoreHistory`)하여 이어서 대화할 수 있게 한다.
- FR-CHM-004 [P1]: THE SYSTEM SHALL 사용자가 새 대화를 시작할 수 있는 버튼을 제공한다.

### 5. 글쓰기 확장 (FR-WRT 연속) — 사용자 피드백 ⑦, 추천 항목(T20/T21 계승)

- FR-WRT-008 [P1]: WHEN 서론 품질 게이트를 실행하면, THE SYSTEM SHALL 원고 텍스트·GateResult·실행 시각을 현재 프로젝트에 저장한다.
- FR-WRT-009 [P1]: THE SYSTEM SHALL 점검 기록 이력 목록에서 과거 점검 결과를 다시 볼 수 있게 한다.
- FR-WRT-010 [P1]: THE SYSTEM SHALL (SPEC-TSA-001 FR-WRT-003의 구현으로서) 국문/영문 문단을 학술 문체로 다듬고 변경 사유를 함께 제시한다.
- FR-WRT-011 [P1]: WHEN 사용자가 모의 심사를 요청하면(SPEC-TSA-001 FR-WRT-004의 구현으로서), THE SYSTEM SHALL Reviewer 2 관점의 예상 질문·약점을 단일 모델 역할극으로 생성하고, 결과를 프로젝트별로 저장한다(FR-WRT-008과 동일한 저장 패턴).

### 6. 운영 — 백업·체크포인트·마이그레이션 (NFR-OPS)

- NFR-OPS-001 [P1]: THE SYSTEM SHALL 프로젝트별 데이터 구조 확장 이후에도 앱 종료 시 전체 data 폴더에 대한 자동 백업 zip을 생성하고 최근 5개만 보관한다(SPEC-TSA-001 설계 결정 6 계승).
- NFR-OPS-002 [P1]: THE SYSTEM SHALL 딥리서치 진행 상태를 프로젝트별 경로에 체크포인트로 저장하고, 중단 후 재실행 시 마지막 체크포인트부터 이어서 진행한다(SPEC-TSA-001 FR-RES-007/008 구현 완결).
- NFR-OPS-003 [P0]: THE SYSTEM SHALL 마이그레이션·프로젝트 전환·자동 저장 전 과정에서 SPEC-TSA-001의 핵심 불변식(파일 300줄 제한, `paths.ts` 경유 경로 접근, IPC 런타임 가드, 서지 결정론 FR-RES-005, 실패=결과값)을 그대로 준수한다.

## 보류 (진짜 사용자 판단 필요)

- 5탭 구성의 최종 레이블·배치 확정(안은 제시했으나 실사용 리뷰 후 조정 여지).
- 문헌 보관함 항목 삭제 시 완전 삭제(하드) vs 재복구 가능 여부(현재는 명시적 삭제 버튼 = 하드 삭제로 기본 제안).
- 리서치 이력 저장 개수/용량 상한 여부(현재는 무제한 제안, 로컬 JSON 규모가 작아 당장은 문제 없음).

## 생성 파일 상세

구체적인 파일/모듈 목록과 소유권은 plan.md의 태스크 테이블을 따른다. 요약하면 다음과 같다.

- app/src/core/project/ - 프로젝트 데이터 모델, 인덱스 저장소 (FR-PRJ-*)
- app/src/main/project/ - 경로 레이아웃 확장, default 마이그레이션 (FR-PRJ-001/003)
- app/src/main/ipc/projectContext.ts - 프로젝트 전환 시 서비스 재조립 (FR-PRJ-002)
- app/src/core/library/ - 문헌 보관함 코어, 서지 포맷터 (FR-LIB-*)
- app/src/core/research-history/ - 리서치 이력 코어 (FR-RSH-001/002)
- app/src/core/chat/researchHandoff.ts, sessionStore.ts - 회의하기 연계, 대화 세션 영속 (FR-RSH-003/004, FR-CHM-*)
- app/src/core/writing/gateHistoryStore.ts, polish.ts, mockReview.ts, mockReviewStore.ts - 글쓰기 확장 (FR-WRT-008~011)
- app/src/main/backup/, app/src/core/research-pipeline/checkpoint.ts - 운영 (NFR-OPS-*)
- app/src/main/ipc/ - 도메인별 핸들러 모듈 분리(projectHandlers.ts 등), shared/ipc-channels 리팩터
- app/src/renderer/ - 프로젝트 전환 UI, 보관함/리서치 이력/대화 목록/점검 기록 화면, 탭 재구성
