export const HLTB_BASE_URL = 'https://howlongtobeat.com';

const DEFAULT_HEADERS = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Origin': `${HLTB_BASE_URL}/`,
  'Referer': `${HLTB_BASE_URL}/`,
  'Accept': 'application/json',
});

export function getHltbHeaders(extra = {}) {
  return { ...DEFAULT_HEADERS, ...extra };
}

export function buildHltbSearchPayload(gameName, hpKey = null, hpVal = null) {
  const searchTerms = String(gameName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const payload = {
    searchType: 'games',
    searchTerms,
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };

  if (hpKey) {
    payload[hpKey] = hpVal;
  }

  return payload;
}

export function extractHltbSecurityInit(payload) {
  const token = typeof payload?.token === 'string' && payload.token.trim() ? payload.token.trim() : null;
  const hpKey = typeof payload?.hpKey === 'string' && payload.hpKey.trim() ? payload.hpKey.trim() : null;
  const hpVal = typeof payload?.hpVal === 'string' && payload.hpVal.trim() ? payload.hpVal.trim() : null;

  if (!token || !hpKey || !hpVal) return null;

  return { token, hpKey, hpVal };
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreTitleMatch(candidateTitle, targetTitle) {
  const candidate = normalizeTitle(candidateTitle);
  const target = normalizeTitle(targetTitle);

  if (!candidate || !target) return -1;
  if (candidate === target) return 1000;

  let score = 0;
  if (candidate.startsWith(target)) score += 400;
  if (candidate.includes(target)) score += 250;

  const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
  const targetTokens = target.split(' ').filter(Boolean);
  score += targetTokens.reduce((sum, token) => sum + (candidateTokens.has(token) ? 10 : 0), 0);
  score -= Math.abs(candidate.length - target.length);

  return score;
}

export function pickBestHltbGame(games, gameName) {
  if (!Array.isArray(games) || !games.length) return null;

  return [...games]
    .sort((a, b) => scoreTitleMatch(b?.game_name, gameName) - scoreTitleMatch(a?.game_name, gameName))[0];
}

function secondsToHours(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  return Math.round((numericValue / 3600) * 10) / 10;
}

export function hasHltbTiming(data) {
  return Boolean(data && (data.mainStory || data.mainExtra || data.completionist));
}

export function mapHltbSearchResponse(payload, gameName) {
  const game = pickBestHltbGame(payload?.data, gameName);
  if (!game) return { _notFound: true };

  return {
    mainStory: secondsToHours(game.comp_main),
    mainExtra: secondsToHours(game.comp_plus),
    completionist: secondsToHours(game.comp_100),
  };
}
