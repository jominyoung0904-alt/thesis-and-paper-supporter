/**
 * Semantic Scholar/OpenAlex mock fixtures (FR-RES-002, NFR-ACAPI-001), split
 * out of `mockData.ts` to stay under the project's per-file line limit.
 * Re-exported from `mockData.ts` so every client keeps importing from that
 * one module.
 *
 * OpenAlex runs in real mode unconditionally (no key/IP restriction — see
 * `openAlexClient.ts`), so `OPENALEX_MOCK_PAPERS` is exercised only in tests.
 */

import type { PaperMetadata } from './types';

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
