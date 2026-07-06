/**
 * Fetches How Long To Beat completion times for a Steam game.
 * Caching is handled entirely in the main process (hltb_cache.json in userData).
 * @param {string|number} appId - Steam App ID
 * @param {string} [gameName] - Optional fallback name for searching
 * @returns {Promise<{mainStory: number|null, mainExtra: number|null, completionist: number|null}|{_notFound: true}|null>}
 */
export async function getHLTBTime(appId, gameName) {
  return window.electronAuth.getHLTBTime(appId, gameName);
}
