/**
 * Deterministic mock fixtures for the four academic API clients
 * (FR-RES-002, NFR-ACAPI-001). Used whenever a client is constructed with
 * `mockMode: true`.
 *
 * OpenAlex runs in real mode unconditionally (no key/IP restriction — see
 * `openAlexClient.ts`), so `OPENALEX_MOCK_PAPERS` is exercised only in tests.
 * KCI and ScienceON remain mock-only in production builds until a real key
 * is registered (see research.md "국내 API 전환 결정"), and it is what lets
 * the deep-research pipeline (T15) and the E2E suite (T29) run without any
 * real key.
 *
 * Field shapes mirror the real `PaperMetadata` contract exactly (authors as
 * an array, nullable abstract/venue/citationCount) so downstream code never
 * has to special-case mock vs. real data.
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

export const SEMANTIC_SCHOLAR_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'semanticscholar', externalId: '649def34f8be52c8b66281af98ae884',
    title: 'A Survey of Transformer-Based Approaches for Scientific Literature Summarization',
    authors: ['A. Novak', 'J. Kim'], year: 2024,
    abstract: 'We survey transformer-based extractive and abstractive summarization methods applied to scientific literature.',
    venue: 'ACL', url: 'https://www.semanticscholar.org/paper/649def34f8be52c8b66281af98ae884',
    citationCount: 42,
  },
  {
    source: 'semanticscholar', externalId: '7a1c2e3f4b5d6a7c8e9f0a1b2c3d4e5f',
    title: 'Graduate Student Mental Health: A Longitudinal Study of Stress and Coping',
    authors: ['S. Martinez', 'R. Chen', 'L. Park'], year: 2022,
    abstract: 'This longitudinal study tracks stress and coping strategies among graduate students across three academic years.',
    venue: 'Journal of Higher Education', url: 'https://www.semanticscholar.org/paper/7a1c2e3f4b5d6a7c8e9f0a1b2c3d4e5f',
    citationCount: 18,
  },
  {
    source: 'semanticscholar', externalId: '1f2e3d4c5b6a7988776655443322110',
    title: 'Energy-Efficient Routing Protocols for Wireless Sensor Networks: A Review',
    authors: ['M. Okafor'], year: 2023,
    abstract: 'We review energy-efficient routing protocols for wireless sensor networks and compare their performance under load.',
    venue: 'IEEE Sensors Journal', url: 'https://www.semanticscholar.org/paper/1f2e3d4c5b6a7988776655443322110',
    citationCount: 29,
  },
  {
    source: 'semanticscholar', externalId: 'ab12cd34ef56ab78cd90ef12ab34cd56',
    title: 'Reinforcement Learning for Robotic Path Planning in Dynamic Environments',
    authors: ['T. Ivanov', 'H. Suzuki'], year: 2024,
    abstract: 'A reinforcement learning framework for path planning that adapts to dynamic obstacles in real time.',
    venue: 'ICRA', url: 'https://www.semanticscholar.org/paper/ab12cd34ef56ab78cd90ef12ab34cd56',
    citationCount: 11,
  },
  {
    source: 'semanticscholar', externalId: 'de45fa67bc89de01fa23bc45de67fa89',
    title: 'Research Ethics Training and Its Impact on Plagiarism Prevention in Higher Education',
    authors: ['C. Dubois'], year: 2021,
    abstract: 'We evaluate whether structured research ethics training reduces self-reported plagiarism among doctoral students.',
    venue: 'Studies in Higher Education', url: 'https://www.semanticscholar.org/paper/de45fa67bc89de01fa23bc45de67fa89',
    citationCount: 33,
  },
  {
    source: 'semanticscholar', externalId: '99887766554433221100ffeeddccbbaa',
    title: 'Blockchain-Based Data Integrity Verification for Academic Repositories',
    authors: ['Y. Tanaka', 'P. Silva'], year: 2023,
    abstract: 'We propose a blockchain-based scheme for verifying the integrity of records stored in academic data repositories.',
    venue: 'Journal of Information Security', url: 'https://www.semanticscholar.org/paper/99887766554433221100ffeeddccbbaa',
    citationCount: 9,
  },
  {
    source: 'semanticscholar', externalId: '00112233445566778899aabbccddeeff',
    title: 'Self-Regulated Learning Strategies in Online Higher Education',
    authors: ['E. Johansson'], year: 2022,
    abstract: 'This study examines the self-regulated learning strategies used by students in fully online graduate courses.',
    venue: 'Computers & Education', url: 'https://www.semanticscholar.org/paper/00112233445566778899aabbccddeeff',
    citationCount: 21,
  },
];

export const OPENALEX_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000001',
    title: '생성형 AI를 활용한 논문 작성 지원 도구의 사용성 평가',
    authors: ['김도윤', '이하율'], year: 2025,
    abstract: '대학원생을 대상으로 생성형 AI 기반 논문 작성 지원 도구의 사용성과 학습 효과를 설문 및 로그 분석으로 평가하였다.',
    venue: '정보처리학회논문지', url: 'https://doi.org/10.1234/kci.2025.4401000001',
    citationCount: 2,
  },
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000002',
    title: '대학원생 연구윤리 교육 프로그램의 효과성에 관한 메타분석',
    authors: ['박서윤'], year: 2024,
    abstract: '국내 연구윤리 교육 프로그램 관련 선행연구를 메타분석하여 표절 예방 효과의 크기를 종합적으로 산출하였다.',
    venue: '교육학연구', url: 'https://doi.org/10.1234/kci.2024.4401000002',
    citationCount: 5,
  },
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000003',
    title: '트랜스포머 기반 한국어 학술 문헌 자동 분류 모델 성능 비교',
    authors: ['최민서', '정유안', '오지호'], year: 2025,
    abstract: null,
    venue: '한국컴퓨터정보학회논문지', url: 'https://doi.org/10.1234/kci.2025.4401000003',
    citationCount: 1,
  },
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000004',
    title: '질적 연구의 신뢰성 확보를 위한 삼각검증 전략 재고찰',
    authors: ['한소율'], year: 2023,
    abstract: '질적 연구방법론에서 신뢰성과 타당성을 확보하기 위한 삼각검증 전략의 적용 사례를 재검토하였다.',
    venue: '질적탐구', url: 'https://doi.org/10.1234/kci.2023.4401000004',
    citationCount: null,
  },
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000005',
    title: 'A Cross-National Comparison of Graduate Research Ethics Curricula',
    authors: ['E. Fischer', 'N. Adeyemi'], year: 2024,
    abstract: 'We compare graduate-level research ethics curricula across six countries and assess plagiarism-prevention outcomes.',
    venue: 'Studies in Higher Education', url: 'https://doi.org/10.1234/oa.2024.4401000005',
    citationCount: 14,
  },
  {
    source: 'openalex', externalId: 'https://openalex.org/W4401000006',
    title: 'Large Language Models as Literature Review Assistants: A Systematic Mapping',
    authors: ['R. Kowalski'], year: 2025,
    abstract: 'A systematic mapping study of how large language models are used to assist literature review workflows.',
    venue: 'Scientometrics', url: 'https://doi.org/10.1234/oa.2025.4401000006',
    citationCount: 3,
  },
];

/**
 * Filters a mock fixture set by naive substring matching against the title
 * and abstract, simulating a real provider's relevance search without any
 * network call. Deterministic: same query + same fixture array always
 * yields the same ordered subset.
 *
 * An empty or whitespace-only query returns the first `limit` fixtures
 * unfiltered ("browse" behavior). A non-empty query that matches nothing
 * falls back to the first `limit` fixtures too, so mock mode never starves
 * the pipeline of results it can render — mirroring the real providers'
 * behavior of usually returning *something* for a broad query.
 */
export function filterMockPapers(papers: PaperMetadata[], query: string, limit: number): PaperMetadata[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return papers.slice(0, limit);
  }

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  const matched = papers.filter((paper) => {
    const haystack = `${paper.title} ${paper.abstract ?? ''} ${paper.authors.join(' ')}`.toLowerCase();
    return tokens.some((token) => haystack.includes(token));
  });

  return (matched.length > 0 ? matched : papers).slice(0, limit);
}
