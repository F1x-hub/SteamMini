import { describe, test, expect } from 'vitest';
import {
  badgeRowWithDropsEN,
  badgeRowWithDropsRU,
  badgeRowWithDropsRU2,
  badgeRowNoDropsEN,
  badgeRowNoDropsRU,
  badgeRowNoDrpsInfo,
  fullBadgesPage,
  emptyBadgesPage,
} from '../mocks/badgesHtml.mock.js';

/**
 * Extract the badge parsing logic from SteamAPI.getRemainingCardDrops.
 * We replicate the core parsing here to test it in isolation.
 * This mirrors the logic in src/api/steam.js lines 196-261.
 */
function parseBadgesFromHtml(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const drops = {};
  const rows = doc.querySelectorAll('.badge_row');

  if (!rows || rows.length === 0) return drops;

  rows.forEach((row) => {
    const titleEl = row.querySelector('.badge_title');
    const infoEl = row.querySelector('.progress_info_bold');

    if (!titleEl) return;

    // Get first text node content (skip "View details" spans)
    let title = '';
    for (const node of titleEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const trimmed = node.textContent.trim();
        if (trimmed) {
          title = trimmed;
          break;
        }
      }
    }

    if (!title) return;

    let remaining = null;
    let dropsText = '';

    if (infoEl) {
      dropsText = infoEl.textContent.trim();
    }

    if (!dropsText) {
      dropsText = row.textContent || '';
    }

    const dropsMatch =
      dropsText.match(/(\d+)\s*card drops remaining/i) ||
      dropsText.match(/Ещё выпадет карточек:\s*(\d+)/i) ||
      dropsText.match(/Еще выпадет карточек:\s*(\d+)/i) ||
      dropsText.match(/Осталось выпадений:\s*(\d+)/i);

    if (dropsMatch && dropsMatch[1]) {
      remaining = parseInt(dropsMatch[1], 10);
    } else if (
      dropsText.includes('No card drops remaining') ||
      dropsText.includes('Карточки больше не выпадут') ||
      dropsText.includes('Больше карточек не выпадет')
    ) {
      remaining = 0;
    }

    if (remaining !== null) {
      drops[title] = remaining;
    }
  });

  return drops;
}

/**
 * Check if the parsed page has a next page link
 */
function hasNextPage(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const pagingControls = doc.querySelector('.pageLinks');
  if (!pagingControls) return false;
  const nextLink = doc.querySelector('.pagebtn:last-child');
  if (!nextLink || nextLink.classList.contains('disabled')) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// BadgesParser Tests
// ═══════════════════════════════════════════════════════════════════════

describe('BadgesParser', () => {

  test('parses remaining drops count from English HTML', () => {
    const result = parseBadgesFromHtml(badgeRowWithDropsEN);
    expect(result['Super Fantasy Kingdom']).toBe(4);
  });

  test('parses remaining drops from Russian HTML (Ещё)', () => {
    const result = parseBadgesFromHtml(badgeRowWithDropsRU);
    expect(result['Космическая Одиссея']).toBe(3);
  });

  test('parses remaining drops from Russian HTML (Еще without ё)', () => {
    const result = parseBadgesFromHtml(badgeRowWithDropsRU2);
    expect(result['Игра Без Ё']).toBe(7);
  });

  test('returns 0 for "No card drops remaining" (English)', () => {
    const result = parseBadgesFromHtml(badgeRowNoDropsEN);
    expect(result['Half-Life 2']).toBe(0);
  });

  test('returns 0 for "Карточки больше не выпадут" (Russian)', () => {
    const result = parseBadgesFromHtml(badgeRowNoDropsRU);
    expect(result['Портал 2']).toBe(0);
  });

  test('parses game title — only first text node, not "View details"', () => {
    const result = parseBadgesFromHtml(badgeRowWithDropsEN);
    const titles = Object.keys(result);
    expect(titles[0]).toBe('Super Fantasy Kingdom');
    expect(titles[0]).not.toContain('View details');
  });

  test('ignores badge rows without drops info (community badges)', () => {
    const result = parseBadgesFromHtml(badgeRowNoDrpsInfo);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('parses full page with multiple badge rows', () => {
    const result = parseBadgesFromHtml(fullBadgesPage);

    expect(Object.keys(result).length).toBeGreaterThan(0);

    expect(result).toMatchObject({
      'Super Fantasy Kingdom': 4,
      'Half-Life 2': 0,
      'Космическая Одиссея': 3,
    });

    // "Community Leader" should NOT be in the result (no drops info)
    expect(result).not.toHaveProperty('Community Leader');
  });

  test('does not throw on empty page', () => {
    expect(() => parseBadgesFromHtml(emptyBadgesPage)).not.toThrow();
    const result = parseBadgesFromHtml(emptyBadgesPage);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('does not throw on empty string', () => {
    expect(() => parseBadgesFromHtml('')).not.toThrow();
  });

  test('detects next page link on paginated page', () => {
    expect(hasNextPage(fullBadgesPage)).toBe(true);
  });

  test('detects no next page when pagebtn is disabled', () => {
    const html = `<html><body>
      <div class="pageLinks">
        <a class="pagebtn disabled" href="?p=2">&gt;</a>
      </div>
    </body></html>`;
    expect(hasNextPage(html)).toBe(false);
  });

  test('detects no next page when pageLinks absent', () => {
    expect(hasNextPage(emptyBadgesPage)).toBe(false);
  });
});
