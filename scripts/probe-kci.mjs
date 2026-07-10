// Probe helper for the KCI 논문정보서비스 OpenAPI (data.go.kr B552540).
// Usage: node scripts/probe-kci.mjs <serviceKey> [mode]
//   mode "ops"    — sweep openApiD###List paths to discover live operations
//   mode "search" — try title-search parameter variants against candidates
// Read-only GET probing; safe to run repeatedly.

const key = process.argv[2];
const mode = process.argv[3] ?? 'ops';
if (!key) {
  console.error('usage: node probe-kci.mjs <serviceKey> [ops|search]');
  process.exit(1);
}

const BASE = 'https://apis.data.go.kr/B552540/KCIOpenApi/artiInfo';

async function get(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    return { status: 0, text: String(err) };
  }
}

function summarize(text) {
  const t = text.replace(/\s+/g, ' ').slice(0, 160);
  return t;
}

if (mode === 'ops') {
  // The one documented op is D217; sweep the neighborhood for the rest.
  for (let n = 200; n <= 235; n++) {
    const url = `${BASE}/openApiD${n}List?serviceKey=${key}&recordCnt=1&pageNo=1`;
    const { status, text } = await get(url);
    const looksAlive = status === 200 && !/ROUTE|NOT_FOUND|Unauthorized|SERVICE ERROR/i.test(text);
    console.log(`D${n} [${status}] ${looksAlive ? 'ALIVE' : ''} ${summarize(text)}`);
  }
} else {
  // Candidate title-search params to try on an op passed via env or default D216.
  const op = process.env.KCI_OP ?? 'openApiD216List';
  const params = ['title', 'artiTitle', 'artiNm', 'artiTitl', 'searchKeyword', 'keyword'];
  for (const p of params) {
    const url = `${BASE}/${op}?serviceKey=${key}&recordCnt=2&pageNo=1&${p}=${encodeURIComponent('메타인지')}`;
    const { status, text } = await get(url);
    console.log(`\n=== ${op} ?${p}=메타인지 [${status}] ===\n${text.slice(0, 500)}`);
  }
}
