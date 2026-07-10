/**
 * Google CSE (RISS-scoped thesis search) mock fixtures (T32, NFR-ACAPI-002
 * 조기 구현), split out of `mockData.ts` to stay under the project's
 * per-file line limit. Re-exported from `mockData.ts` so `googleCseClient.ts`
 * keeps importing from that one module, same as every other client.
 *
 * Unlike the other providers, the real client never gets a plain-text
 * authors list, publication year, or citation count out of a search-snippet
 * result — see `googleCseClient.ts`'s doc comment — so these fixtures
 * deliberately mirror that (empty `authors`, `null` year/citationCount)
 * rather than inventing more complete-looking mock data than the real API
 * can ever return.
 */

import type { PaperMetadata } from './types';

export const GOOGLE_CSE_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'googlecse', externalId: 'https://www.riss.kr/link?id=T16812345',
    title: '대학원생의 학위논문 작성 스트레스와 대처전략에 관한 연구',
    authors: [], year: null,
    abstract: '본 연구는 국내 대학원 석사과정생을 대상으로 학위논문 작성 과정에서 경험하는 스트레스 요인과 대처전략을 심층면담을 통해 분석하였다.',
    venue: 'RISS 학위논문 검색', url: 'https://www.riss.kr/link?id=T16812345',
    citationCount: null,
  },
  {
    source: 'googlecse', externalId: 'https://www.riss.kr/link?id=T16823456',
    title: '텍스트 마이닝을 활용한 국내 인공지능 교육 정책 동향 분석: 박사학위논문',
    authors: [], year: null,
    abstract: '이 박사학위논문은 최근 10년간 발표된 인공지능 교육 정책 관련 뉴스와 보고서를 텍스트 마이닝 기법으로 분석하여 정책 담론의 변화 양상을 밝혔다.',
    venue: 'RISS 학위논문 검색', url: 'https://www.riss.kr/link?id=T16823456',
    citationCount: null,
  },
  {
    source: 'googlecse', externalId: 'https://www.riss.kr/link?id=T16834567',
    title: '온라인 비대면 수업이 대학생의 학습동기에 미치는 영향: 석사학위논문',
    authors: [], year: null,
    abstract: '본 논문은 비대면 온라인 수업 환경이 대학생의 자기결정성과 학습동기에 미치는 영향을 설문조사와 구조방정식모형으로 검증하였다.',
    venue: 'RISS 학위논문 검색', url: 'https://www.riss.kr/link?id=T16834567',
    citationCount: null,
  },
  {
    source: 'googlecse', externalId: 'https://www.riss.kr/link?id=T16845678',
    title: '지역 소멸 위기 대응을 위한 청년 정착 지원 정책 연구',
    authors: [], year: null,
    abstract: null,
    venue: 'RISS 학위논문 검색', url: 'https://www.riss.kr/link?id=T16845678',
    citationCount: null,
  },
];
