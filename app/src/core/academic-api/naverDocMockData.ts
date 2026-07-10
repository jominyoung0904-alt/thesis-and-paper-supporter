/**
 * Naver Search "전문자료(doc)" mock fixtures (SPEC-TSA-001 후속 T33), split
 * out of `mockData.ts` to stay under the project's per-file line limit.
 * Re-exported from `mockData.ts` so `naverDocClient.ts` keeps importing from
 * that one module, same as every other client.
 *
 * Naver's doc category covers domestic theses/dissertations and reports, so
 * these fixtures mirror that: no citation count is ever returned by the real
 * API either, and `authors`/`year` stay empty/null exactly like the real
 * client (see `naverDocClient.ts`'s doc comment) rather than inventing more
 * complete-looking mock data than the real API can ever return.
 */

import type { PaperMetadata } from './types';

const VENUE_LABEL = '네이버 전문정보';

export const NAVER_DOC_MOCK_PAPERS: PaperMetadata[] = [
  {
    source: 'naverdoc', externalId: 'https://www.riss.kr/link?id=T15912345',
    title: '초등학생의 자기주도학습능력과 학업성취도의 관계 연구: 석사학위논문',
    authors: [], year: null,
    abstract: '본 연구는 초등학교 고학년 학생을 대상으로 자기주도학습능력이 학업성취도에 미치는 영향을 설문조사를 통해 분석하였다.',
    venue: VENUE_LABEL, url: 'https://www.riss.kr/link?id=T15912345',
    citationCount: null,
  },
  {
    source: 'naverdoc', externalId: 'https://www.riss.kr/link?id=T15923456',
    title: '중소기업 근로자의 직무만족과 조직몰입에 관한 실증 연구: 박사학위논문',
    authors: [], year: null,
    abstract: '이 박사학위논문은 중소기업 근로자를 대상으로 직무만족 요인이 조직몰입에 미치는 영향을 구조방정식모형으로 검증하였다.',
    venue: VENUE_LABEL, url: 'https://www.riss.kr/link?id=T15923456',
    citationCount: null,
  },
  {
    source: 'naverdoc', externalId: 'https://www.riss.kr/link?id=T15934567',
    title: '고령친화도시 조성을 위한 정책 방향 연구보고서',
    authors: [], year: null,
    abstract: '본 보고서는 국내외 고령친화도시 사례를 비교 분석하여 지방자치단체가 추진할 수 있는 정책 방향을 제시한다.',
    venue: VENUE_LABEL, url: 'https://www.riss.kr/link?id=T15934567',
    citationCount: null,
  },
  {
    source: 'naverdoc', externalId: 'https://www.riss.kr/link?id=T15945678',
    title: '청소년 스마트폰 과의존 예방을 위한 학교 상담 프로그램 개발: 석사학위논문',
    authors: [], year: null,
    abstract: null,
    venue: VENUE_LABEL, url: 'https://www.riss.kr/link?id=T15945678',
    citationCount: null,
  },
];
