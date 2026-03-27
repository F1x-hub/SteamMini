/**
 * Test fixtures for game data
 */

// Games that need warmup (< 2 hours played) — playtime_forever is in MINUTES
export const warmupGames = [
  { appid: 100, name: 'Warmup Game 1', playtime_forever: 30 },   // 0.5h
  { appid: 101, name: 'Warmup Game 2', playtime_forever: 0 },    // 0h
  { appid: 102, name: 'Warmup Game 3', playtime_forever: 60 },   // 1h
  { appid: 103, name: 'Warmup Game 4', playtime_forever: 90 },   // 1.5h
  { appid: 104, name: 'Warmup Game 5', playtime_forever: 114 },  // 1.9h
];

// Games ready for farm (>= 2 hours played)
export const farmReadyGames = [
  { appid: 200, name: 'Farm Game 1', playtime_forever: 180 },    // 3h
  { appid: 201, name: 'Farm Game 2', playtime_forever: 300 },    // 5h
  { appid: 202, name: 'Farm Game 3', playtime_forever: 600 },    // 10h
];

// Mixed: some need warmup, some ready
export const mixedGames = [...warmupGames.slice(0, 2), ...farmReadyGames.slice(0, 2)];

// Card drops data (appid -> remaining drops)
export const mockCardDropsData = {
  '100': 3, // Warmup Game 1
  '101': 5, // Warmup Game 2
  '102': 2, // Warmup Game 3
  '103': 4, // Warmup Game 4
  '104': 1, // Warmup Game 5
  '200': 2, // Farm Game 1
  '201': 8, // Farm Game 2
  '202': 5, // Farm Game 3
};

// Generate a large batch of games (for testing 30-game limit)
export function generateWarmupGames(count) {
  return Array.from({ length: count }, (_, i) => ({
    appid: 1000 + i,
    name: `Batch Game ${i}`,
    playtime_forever: 0,
  }));
}

export function generateCardDropsForBatch(count) {
  const drops = {};
  for (let i = 0; i < count; i++) {
    drops[String(1000 + i)] = 3;
  }
  return drops;
}
