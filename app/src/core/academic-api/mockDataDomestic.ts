/**
 * KCI/ScienceON mock fixtures (FR-RES-002, NFR-ACAPI-001), split out of
 * `mockData.ts` to stay under the project's per-file line limit. Re-exported
 * from `mockData.ts` so every client keeps importing from that one module.
 *
 * KCI and ScienceON remain mock-only in production builds until a real key
 * is registered (see research.md "국내 API 전환 결정") — it is what lets the
 * deep-research pipeline (T15) and the E2E suite (T29) run without any real
 * key.
 */

import type { PaperMetadata } from './types';

export const KCI_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'kci', externalId: 'kci-mock-001',
    title: '인공지능 기반 논문 작성 지원 도구의 사용성 연구',
    authors: ['김민준', '이서연'], year: 2024,
    abstract: '본 연구는 대학원생을 대상으로 인공지능 기반 논문 작성 지원 도구의 사용성을 평가하고 개선 방향을 제시한다.',
    venue: '정보처리학회논문지', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-001',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-002',
    title: '대학원생의 연구윤리 인식과 표절 예방 교육 효과',
    authors: ['박지훈'], year: 2023,
    abstract: '연구윤리 교육 프로그램 참여 전후 대학원생의 표절 인식 변화를 설문조사를 통해 분석하였다.',
    venue: '교육학연구', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-002',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-003',
    title: '딥러닝을 활용한 학술 문헌 자동 분류 시스템 설계',
    authors: ['최유진', '정하늘', '오세훈'], year: 2024,
    abstract: '학술 문헌의 주제 분류 정확도를 높이기 위해 트랜스포머 기반 분류 모델을 설계하고 검증하였다.',
    venue: '한국컴퓨터정보학회논문지', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-003',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-004',
    title: '질적 연구방법론에서의 신뢰성 확보 전략',
    authors: ['한소희'], year: 2022,
    abstract: '질적 연구의 신뢰성과 타당성을 확보하기 위한 삼각검증 및 동료 검토 전략을 사례 중심으로 논의한다.',
    venue: '질적탐구', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-004',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-005',
    title: '블록체인 기반 학술 데이터 무결성 검증 프레임워크',
    authors: ['윤도현', '강나은'], year: 2023,
    abstract: '학술 데이터의 위변조를 방지하기 위한 블록체인 기반 무결성 검증 프레임워크를 제안하고 성능을 평가하였다.',
    venue: '정보보호학회논문지', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-005',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-006',
    title: '대학원생 정신건강과 학업 스트레스의 상관관계 분석',
    authors: ['임하은'], year: 2021,
    abstract: '국내 대학원생 500명을 대상으로 학업 스트레스와 정신건강 지표 간의 상관관계를 회귀분석으로 검증하였다.',
    venue: '한국심리학회지', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-006',
    citationCount: null,
  },
  {
    source: 'kci', externalId: 'kci-mock-007',
    title: '자연어처리 기반 논문 요약 모델의 성능 비교 연구',
    authors: ['서준영', '배수아'], year: 2024,
    abstract: '추출 요약과 생성 요약 방식의 논문 요약 모델을 국문 학술 문헌에 적용하여 성능을 비교하였다.',
    venue: '한국정보과학회 학술발표논문집', url: 'https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=kci-mock-007',
    citationCount: null,
  },
];

export const SCIENCEON_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'scienceon', externalId: 'scienceon-mock-001',
    title: '센서 네트워크 기반 실시간 환경 모니터링 시스템',
    authors: ['조은비', '문재원'], year: 2023,
    abstract: '저전력 센서 노드로 구성된 무선 네트워크를 통해 실내 환경 데이터를 실시간으로 수집·전송하는 시스템을 구현하였다.',
    venue: '전자공학회논문지', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-001',
    citationCount: 4,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-002',
    title: '대학원 교육에서의 멘토링 프로그램 효과성 분석',
    authors: ['신유나'], year: 2022,
    abstract: '대학원 신입생 대상 멘토링 프로그램 참여가 학업 적응과 연구 몰입도에 미치는 영향을 분석하였다.',
    venue: '고등교육정책연구', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-002',
    citationCount: 2,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-003',
    title: '강화학습을 이용한 로봇 경로 계획 최적화',
    authors: ['백승호', '노아름', '류지안'], year: 2024,
    abstract: '동적 장애물이 존재하는 환경에서 강화학습 기반 경로 계획 알고리즘의 수렴 속도와 안전성을 개선하였다.',
    venue: '로봇학회논문지', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-003',
    citationCount: 7,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-004',
    title: '소셜미디어 담론 분석을 통한 청년 정책 인식 연구',
    authors: ['홍지수'], year: 2023,
    abstract: '소셜미디어 게시글 텍스트 마이닝을 통해 청년 정책에 대한 인식과 여론 변화를 추적하였다.',
    venue: '사회과학연구', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-004',
    citationCount: 1,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-005',
    title: '저전력 IoT 디바이스를 위한 에너지 하베스팅 기술 동향',
    authors: ['권도윤', '장은서'], year: 2022,
    abstract: '진동, 열, 광원 기반 에너지 하베스팅 기술을 IoT 디바이스 전원 설계에 적용하는 최신 동향을 정리하였다.',
    venue: '대한전기학회논문지', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-005',
    citationCount: 5,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-006',
    title: '온라인 학습 환경에서의 학습자 자기조절 전략 연구',
    authors: ['남기범'], year: 2021,
    abstract: '비대면 온라인 강좌 수강생의 자기조절학습 전략 사용 양상을 로그 데이터로 분석하였다.',
    venue: '교육공학연구', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-006',
    citationCount: 3,
  },
  {
    source: 'scienceon', externalId: 'scienceon-mock-007',
    title: '자율주행을 위한 라이다-카메라 센서 퓨전 기법',
    authors: ['천예린', '도현우'], year: 2024,
    abstract: '라이다와 카메라 데이터를 결합한 센서 퓨전 기법으로 악천후 환경에서의 객체 인식 정확도를 개선하였다.',
    venue: '자동차공학회논문집', url: 'https://scienceon.kisti.re.kr/srch/selectPORSrchArticle.do?cn=scienceon-mock-007',
    citationCount: 6,
  },
];
