import { describe, expect, test } from 'vitest';
import {
  buildHltbSearchPayload,
  extractHltbSecurityInit,
  hasHltbTiming,
  mapHltbSearchResponse,
  pickBestHltbGame,
} from '../../../electron/hltb.js';

describe('HLTB helpers', () => {
  test('builds finder payload without empty search terms', () => {
    const payload = buildHltbSearchPayload('  Kingdom   s   Deck  ', 'ign_key', 'secret');

    expect(payload.searchType).toBe('games');
    expect(payload.searchTerms).toEqual(['Kingdom', 's', 'Deck']);
    expect(payload.searchOptions.games.sortCategory).toBe('popular');
    expect(payload.searchOptions.lists.sortCategory).toBe('follows');
    expect(payload.useCache).toBe(true);
    expect(payload.ign_key).toBe('secret');
  });

  test('extracts search security init safely', () => {
    expect(extractHltbSecurityInit({ token: 'abc123', hpKey: 'ign_test', hpVal: 'secret' })).toEqual({
      token: 'abc123',
      hpKey: 'ign_test',
      hpVal: 'secret',
    });
    expect(extractHltbSecurityInit({ token: 'abc123' })).toBeNull();
    expect(extractHltbSecurityInit(null)).toBeNull();
  });

  test('prefers exact title matches over earlier loose matches', () => {
    const result = pickBestHltbGame([
      { game_name: 'Kingdom Deck Builder', comp_main: 7200 },
      { game_name: "Kingdom's Deck", comp_main: 14400 },
    ], "Kingdom's Deck");

    expect(result.game_name).toBe("Kingdom's Deck");
  });

  test('maps finder response to hour values', () => {
    const mapped = mapHltbSearchResponse({
      data: [
        { game_name: 'Snake Pass', comp_main: 14400, comp_plus: 19800, comp_100: 28800 },
      ],
    }, 'Snake Pass');

    expect(mapped).toEqual({
      mainStory: 4,
      mainExtra: 5.5,
      completionist: 8,
    });
    expect(hasHltbTiming(mapped)).toBe(true);
  });

  test('returns explicit not found when finder response is empty', () => {
    expect(mapHltbSearchResponse({ data: [] }, 'Unknown Game')).toEqual({ _notFound: true });
    expect(hasHltbTiming({ _notFound: true })).toBe(false);
  });
});
