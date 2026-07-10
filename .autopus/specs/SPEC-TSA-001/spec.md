---
id: SPEC-TSA-001
title: 논문 작성 서포터 1단계 MVP
status: draft
created: 2026-07-10
domain: TSA
source:
  - .autopus/project/decisions-2026-07-10.md
  - .autopus/specs/SPEC-TSA-001/prd.md
---

# SPEC-TSA-001: 논문 작성 서포터 1단계 MVP

**Status**: draft
**Created**: 2026-07-10
**Domain**: TSA (Thesis Support App)

## 목적

한국 대학원생(컴퓨터 비숙련자)이 연구 프로젝트 메모리를 공유 컨텍스트로 삼아 선행연구 딥리서치와 집필·검토를 하나의 채팅 인터페이스로 수행할 수 있는 Electron 데스크톱 앱을 1단계 범위로 구현한다. 설치 없는 포터블 배포, 멀티 LLM 프로바이더, 학술 API 하이브리드 키 전략, 원격 설정 이중화를 횡단 기반으로 삼고, 리스크 1~3번(SmartScreen, zip 미해제 실행, API 오류 안내)은 MVP 필수 항목으로 취급한다. 그린필드 프로젝트이므로 기존 코드 제약은 없다.

## 설계 결정 (PRD 10절 미해결 질문 대응)

PRD의 미해결 질문 7건 중 6건은 아래와 같이 합리적 기본값을 제안한다. 구현 중 근거가 반박되면 변경 가능하나, 별도 승인 없이는 이 기본값을 설계 기준으로 삼는다.

1. 프로젝트 메모리 저장 포맷: JSON 파일. 포터블성, 사용자 가독성, 백업 용이성이 확보되고 1단계 데이터 규모가 작아 경량 DB의 이점이 크지 않다.
2. 품질 게이트 체크리스트 범위: 1단계는 서론 섹션만 필수 구현하고, 본론/결론 등은 동일 패턴을 재사용할 수 있도록 인터페이스만 확장 가능하게 설계한다. PRD 9절 마일스톤이 서론만 MVP로 명시했다.
3. 모의 심사 Debate 구현 방식: 단일 모델의 역할극(prompt 기반 적대적 페르소나)으로 우선 구현한다. 실제 2개 모델 교차 호출은 비용이 2배 이상이고 품질 향상 폭이 검증되지 않았다.
4. ScienceON 승인 지연 시 UX: 승인 대기 기간에는 내장 공용 키로만 조회되며, 화면에 승인 대기 안내 배너를 표시한다. 사용자가 대기 상태를 인지하지 못해 반복 문의하는 것을 방지하는 것이 저비용 대응이다.
5. KCI/ScienceON 무응답 시 리포트 구성: Semantic Scholar 결과만으로 리포트를 구성하고 국내 학술 DB에서 문헌을 찾지 못했음을 명시적으로 표기한다. 결과를 숨기기보다 투명하게 알리는 편이 신뢰를 얻는 데 유리하다.
6. 자동 백업 주기/보관 정책: 세션 종료 시 1회 자동 백업 + 최근 5개 보관(초과분은 오래된 순으로 자동 삭제). 세션 단위가 비숙련자에게 직관적이고 디스크 사용량을 예측 가능하게 통제한다.

7. 원격 설정(endpoints.json) 조회 실패 시 사용자 노출 여부: **확정 (2026-07-10 사용자 결정)** - 실패 시 알림창을 표시한 뒤 "로컬 기본값으로 동작합니다" 안내를 보여주고 로컬 설정값으로 계속 동작한다. 조용한 폴백 대신 투명한 안내를 택하되, 안내 직후 정상 동작이 이어지므로 비숙련자에게 불안을 주지 않는다.

## 요구사항

우선순위 표기: P0 = MVP 1차 출시 필수, P1 = 1단계 내 후속 개선(MVP 이후), P2 = 리스크 완화용 부가 기능.

### 1. 연구 프로젝트 메모리 코어

- FR-MEM-001 [P0]: THE SYSTEM SHALL 연구 질문, 가설, 용어 정의, 연구 결정 이력, 지도교수 피드백을 구조화된 형식으로 저장한다.
- FR-MEM-002 [P0]: WHEN 사용자가 연구 결정을 기록하면, THE SYSTEM SHALL 무엇을 결정했는가와 왜 그렇게 결정했는가를 함께 저장한다.
- FR-MEM-003 [P0]: WHEN 딥리서치 또는 집필/검토 모듈이 LLM을 호출하면, THE SYSTEM SHALL 프로젝트 메모리의 관련 항목을 프롬프트 컨텍스트에 자동으로 주입한다.
- FR-MEM-004 [P0]: THE SYSTEM SHALL 프로젝트 메모리 데이터를 data 폴더 내에 저장하여 폴더 복사만으로 백업이 가능하도록 한다.
- FR-MEM-005 [P1]: THE SYSTEM SHALL 프로젝트 메모리를 프롬프트 캐싱에 유리한 고정 프리픽스 구조로 직렬화한다.
- FR-MEM-006 [P1]: WHEN 사용자가 연구노트 내보내기를 요청하면, THE SYSTEM SHALL 연구 결정 이력을 연구노트 형식의 파일로 내보낸다.
- FR-MEM-007 [P1]: THE SYSTEM SHALL 지도교수 피드백을 구조화하여 저장하고 대응 여부(미대응/대응완료)를 추적 가능하게 한다.

### 2. 선행연구 딥리서치

- FR-RES-001 [P0]: WHEN 사용자가 채팅에 선행연구 질의를 입력하면, THE SYSTEM SHALL LLM을 통해 국문 및 영문 검색어를 각각 생성한다.
- FR-RES-002 [P0]: WHEN 검색어가 생성되면, THE SYSTEM SHALL KCI OPEN API, ScienceON API, Semantic Scholar API를 병렬로 조회하여 제목/초록/저자/인용수를 수집한다.
- FR-RES-003 [P0]: WHEN 병렬 조회 결과가 수집되면, THE SYSTEM SHALL 연구 질문과의 관련도를 기준으로 경량 모델을 사용해 스크리닝한다.
- FR-RES-004 [P0]: THE SYSTEM SHALL 스크리닝된 결과를 종합한 리포트를 생성하며, 모든 인용 항목에 실제 원문 링크 또는 원문 접근 안내를 첨부한다.
- FR-RES-005 [P0]: THE SYSTEM SHALL 리포트의 서지정보(저자/제목/발행연도 등)를 학술 API 응답에서만 결정론적으로 채우며, LLM이 서지정보를 직접 생성하는 경로를 제공하지 않는다.
- FR-RES-006 [P0]: THE SYSTEM SHALL 원문(PDF) 직접 접근이 불가함을 리포트에 명시하고 학교 도서관 계정으로 열람 등 안내 문구를 제공한다.
- FR-RES-007 [P1]: WHILE 딥리서치가 진행 중일 때, THE SYSTEM SHALL 진행 상태(검색어, 조회 결과, 스크리닝 진행률)를 체크포인트로 저장한다.
- FR-RES-008 [P1]: WHEN 딥리서치가 중단된 후 재실행되면, THE SYSTEM SHALL 마지막 체크포인트부터 이어서 진행한다.
- FR-RES-009 [P1]: WHERE KCI 또는 ScienceON 응답에 관련 문헌이 없을 때, THE SYSTEM SHALL 이를 명시하고 Semantic Scholar 결과만으로 리포트를 구성한다.

### 3. 집필/검토 보조

- FR-WRT-001 [P0]: THE SYSTEM SHALL 서론 섹션에 대해 연구 갭 명시, 기여 명시, 모든 주장에 대한 인용 여부를 검증하는 품질 게이트 체크리스트를 제공한다.
- FR-WRT-002 [P0]: WHEN 품질 게이트 기준이 충족되지 않으면, THE SYSTEM SHALL 해당 섹션을 완료 상태로 표시하는 것을 차단하거나 명확한 경고를 표시한다.
- FR-WRT-003 [P1]: THE SYSTEM SHALL 사용자가 작성한 문장을 국문/영문 모두에 대해 학술적 문체로 다듬는 기능을 제공한다.
- FR-WRT-004 [P1]: WHEN 사용자가 모의 심사를 요청하면, THE SYSTEM SHALL 적대적 관점(Reviewer 2)에서 예상 질문과 약점을 제시한다.
- FR-WRT-005 [P1]: WHEN 사용자가 집필 중 삽입된 인용을 클릭하면, THE SYSTEM SHALL 딥리서치에서 확보한 원문 링크로 이동한다.
- FR-WRT-006 [P1]: THE SYSTEM SHALL 집필/검토 시 프로젝트 메모리(연구 질문, 가설, 용어 정의)를 컨텍스트로 활용하여 일관성을 검증한다.
- FR-WRT-007 [P2]: WHERE 서론 외 섹션(본론, 결론 등)의 체크리스트가 정의될 때, THE SYSTEM SHALL 동일한 품질 게이트 인터페이스를 재사용할 수 있어야 한다.

### 4. 채팅 아이디어 회의 (2026-07-10 추가)

- FR-CHT-001 [P0]: THE SYSTEM SHALL 기능 명령 없이도 AI와 자유 대화(아이디어 회의, 연구 주제 상담)가 가능한 채팅 모드를 제공한다.
- FR-CHT-002 [P0]: WHILE 채팅 대화가 진행되는 동안, THE SYSTEM SHALL 프로젝트 메모리를 컨텍스트로 주입하며, 대화 중 도출된 결정을 사용자 확인을 거쳐 연구 결정 이력(FR-MEM-002)으로 저장할 수 있게 한다.
- FR-CHT-003 [P1]: WHILE 대화 이력이 길어지는 동안, THE SYSTEM SHALL 오래된 대화를 요약(컴팩션)하여 호출당 토큰 사용량을 통제한다.

### 5. 횡단 요구사항 - 포터블 배포

- NFR-DEP-001 [P0]: THE SYSTEM SHALL Electron 기반 포터블 zip으로 배포되며 설치 프로그램/레지스트리/AppData/관리자 권한을 요구하지 않는다.
- NFR-DEP-002 [P0]: WHEN 앱이 시작되면, THE SYSTEM SHALL 자신의 실행 경로를 검사하여 zip 내부 또는 임시 폴더에서 실행 중이면 사용자에게 안내 메시지를 표시한 후 종료한다. (리스크 2)
- NFR-DEP-003 [P0]: THE SYSTEM SHALL app, data, config 디렉터리를 분리하여 앱 업데이트 시 app 폴더만 교체하고 data 폴더를 보존한다.
- NFR-DEP-004 [P0]: THE SYSTEM SHALL 최초 실행 시 SmartScreen 경고 대응을 위한 안내 HTML(처음이라면_읽어주세요.html)을 zip 최상위에 포함한다. (리스크 1)

### 6. 횡단 요구사항 - 멀티 프로바이더 LLM

- NFR-LLM-001 [P0]: THE SYSTEM SHALL Claude, Gemini, OpenAI 3개 프로바이더를 지원하는 어댑터 계층으로 LLM 호출을 추상화한다.
- NFR-LLM-002 [P0]: WHEN 최초 실행 설정 마법사가 진행되면, THE SYSTEM SHALL 프로바이더 선택과 API 키 입력을 요구하고 키를 로컬 암호화하여 저장한다.
- NFR-LLM-003 [P0]: WHILE 무료 모드(Gemini Flash 무료 티어)가 활성화된 동안, THE SYSTEM SHALL 분당 10~15회 호출 제한을 준수하는 rate limiter를 적용한다.
- NFR-LLM-004 [P0]: WHEN API 호출이 429 오류, 키 오류, 크레딧 소진으로 실패하면, THE SYSTEM SHALL 이를 한국어 일상어로 번역하여 안내하고 자동 재시도를 수행한다. (리스크 3)
- NFR-LLM-005 [P1]: WHILE 유료 모드가 활성화된 동안, THE SYSTEM SHALL 작업 복잡도에 따라 경량/상위 모델을 자동 배치한다.
- NFR-LLM-006 [P1]: THE SYSTEM SHALL 현재 모드(무료/유료)에 따른 품질/프라이버시 안내 문구를 각 기능 화면에 배지로 표시하며, 문구는 하드코딩하지 않고 원격 설정에서 로드한다.
- NFR-LLM-007 [P1]: THE SYSTEM SHALL 월 사용액을 실시간으로 표시하고 사용자가 설정한 상한에 도달하면 알림을 표시한다.
- NFR-LLM-008 [P1]: WHILE 무료 모드가 활성화된 동안, THE SYSTEM SHALL 일일 API 호출 사용량을 추적해 잔량을 표시하고, 딥리서치 실행 전 예상 호출 수가 잔량을 초과하면 사전 안내한다(리셋 시각 = 한국시간 오후 4~5시 안내 포함).

### 7. 횡단 요구사항 - 학술 API 하이브리드 키

- NFR-ACAPI-001 [P0]: THE SYSTEM SHALL 내장 공용 키를 기본으로 제공하여 압축 해제 직후 별도 설정 없이 학술 검색이 가능하도록 한다.
- NFR-ACAPI-002 [P1]: THE SYSTEM SHALL 설정 화면에서 사용자가 자신의 KCI/ScienceON 학술 키를 등록할 수 있는 단계별 스크린샷 마법사를 제공한다.
- NFR-ACAPI-003 [P1]: THE SYSTEM SHALL ScienceON API 토큰을 2시간 만료 전에 자동 갱신한다.
- NFR-ACAPI-004 [P2]: WHEN 내장 공용 키의 사용량이 임계치에 근접하면, THE SYSTEM SHALL 개인 키 발급을 유도하는 배너를 표시한다. (리스크 8)
- NFR-ACAPI-005 [P2]: THE SYSTEM SHALL 내장 학술 키를 원격 설정을 통해 교체하거나 폐기할 수 있어야 한다.

### 8. 횡단 요구사항 - 원격 설정 이중화

- NFR-CFG-001 [P0]: THE SYSTEM SHALL config/settings.json에 모든 외부 API 주소를 저장하고 앱 내 설정 화면과 텍스트 편집기 양쪽에서 수정 가능하게 한다.
- NFR-CFG-002 [P1]: WHEN 앱이 시작되면, THE SYSTEM SHALL GitHub Pages에 호스팅된 endpoints.json 원격 설정을 조회하고 실패 시 로컬 설정값으로 폴백한다.
- NFR-CFG-003 [P1]: THE SYSTEM SHALL 설정 화면에 기본값 복원 버튼을 제공한다.
- NFR-CFG-004 [P1]: WHEN 원격 설정 조회가 실패하면, THE SYSTEM SHALL 실패 알림창과 "로컬 기본값으로 동작합니다" 안내를 표시한 후 로컬 설정값으로 정상 동작을 계속한다 (설계 결정 7번 - 확정).

### 9. 횡단 요구사항 - 리스크 대응 (1~3번 MVP 필수, 4~11번 후속)

- NFR-RISK-004 [P1]: WHEN 사용자가 폴더 공유를 위한 내보내기를 요청하면, THE SYSTEM SHALL 키 파일을 제외한 데이터만 내보낸다.
- NFR-RISK-005 [P2]: WHEN 앱 데이터 폴더가 OneDrive 또는 바탕화면 동기화 경로에 위치하면, THE SYSTEM SHALL 권장 위치를 안내한다(강제하지 않음).
- NFR-RISK-006 [P1]: WHEN 앱이 시작되면, THE SYSTEM SHALL data 폴더에 대한 쓰기 테스트를 수행하고 실패 시 이동을 안내한다.
- NFR-RISK-007 [P2]: WHEN 앱이 시작되면, THE SYSTEM SHALL 각 외부 서비스에 대한 연결 진단 화면(서비스별 성공/실패 표시)과 프록시 설정란을 제공한다.
- NFR-RISK-009 [P1]: THE SYSTEM SHALL LLM 모델명을 원격 설정에서 로드하여 코드 변경 없이 모델 단종에 대응한다.
- NFR-RISK-010 [P1]: THE SYSTEM SHALL data 폴더에 대해 세션 종료 시 자동 백업을 수행하고(설계 결정 6번) 사용자가 데이터를 수동으로 내보낼 수 있게 한다.

## 생성 파일 상세

구체적인 파일/모듈 목록과 소유권은 plan.md의 태스크 테이블을 따른다. 요약하면 다음과 같다.

- src/core/memory/ - 연구 프로젝트 메모리 코어 (FR-MEM-*)
- src/core/research-pipeline/, src/core/academic-api/ - 딥리서치 (FR-RES-*)
- src/core/writing/ - 집필/검토 보조 (FR-WRT-*)
- src/core/chat/ - 채팅 아이디어 회의: 대화 관리, 컴팩션 (FR-CHT-*)
- src/core/llm/ - 멀티 프로바이더 어댑터 (NFR-LLM-*)
- src/main/startup/, src/main/config/, src/main/backup/ - 포터블 배포, 원격 설정, 백업 (NFR-DEP-*, NFR-CFG-*, NFR-RISK-*)
- src/renderer/ - 채팅 UI, 설정 마법사, 진단 화면
