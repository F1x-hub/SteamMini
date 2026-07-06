import { icons } from '../utils/icons.js';
import { getAll } from './hltbCache.js';

function playedHours(game) {
  return (game.playtime_forever || 0) / 60;
}

function isNotStarted(game) {
  return playedHours(game) < 0.5;
}

function isStartedButUnfinished(game, hltb) {
  if (!hltb?.main) return false;
  const hours = playedHours(game);
  return hours >= 0.5 && hours < hltb.main * 0.85;
}

function achievementsLeft(game) {
  const total = game.achievements_total || 0;
  const done = game.achievements_unlocked || 0;
  return total - done;
}

function achievementPct(game) {
  const total = game.achievements_total || 0;
  if (total === 0) return 0;
  return (game.achievements_unlocked || 0) / total;
}

const RPG_STRATEGY_GENRES = ['RPG', 'Strategy', 'Turn-Based Strategy', 'Grand Strategy', 'JRPG'];

export const PLAYLISTS = [
  {
    id: 'one_evening',
    title: `${icons.moon} На один вечер`,
    subtitle: 'Игры до 4 часов — начать и закончить сегодня',
    filter: (game, hltb) => hltb?.main > 0 && hltb.main <= 4 && isNotStarted(game),
    sort: (a, b) => a.hltb.main - b.hltb.main,
    limit: 12,
  },
  {
    id: 'weekend',
    title: `${icons.calendar} На выходные`,
    subtitle: 'От 4 до 15 часов — идеально за пару дней',
    filter: (game, hltb) =>
      hltb?.main > 4 &&
      hltb.main <= 15 &&
      (isNotStarted(game) || isStartedButUnfinished(game, hltb)),
    sort: (a, b) => a.hltb.main - b.hltb.main,
    limit: 12,
  },
  {
    id: 'time_killers',
    title: `${icons.swords} Убийцы времени`,
    subtitle: 'RPG и стратегии на 100+ часов',
    filter: (game, hltb) =>
      hltb?.complete >= 100 &&
      RPG_STRATEGY_GENRES.some((genre) => game.genres?.includes(genre)) &&
      isNotStarted(game),
    sort: (a, b) => b.hltb.complete - a.hltb.complete,
    limit: 8,
  },
  {
    id: 'finish_it',
    title: `${icons.play} Уже начато`,
    subtitle: 'Ты это запускал — осталось совсем немного',
    filter: (game, hltb) => isStartedButUnfinished(game, hltb),
    sort: (a, b) => {
      const pctA = playedHours(a) / (a.hltb.main || 1);
      const pctB = playedHours(b) / (b.hltb.main || 1);
      return pctB - pctA;
    },
    limit: 12,
  },
  {
    id: 'platinum_close',
    title: `${icons.trophy} Осталось немного`,
    subtitle: 'От 25% до 99% достижений — уже почти платина',
    filter: (game) => {
      const total    = game.achievements_total || 0;
      const unlocked = game.achievements_unlocked || 0;
      if (total < 3)         return false; // без смысловых ачивок
      if (unlocked === 0)    return false; // не начато
      if (unlocked >= total) return false; // уже 100%
      const pct = unlocked / total;
      return pct >= 0.25;
    },
    sort: (a, b) => {
      const pctA = (a.achievements_unlocked || 0) / (a.achievements_total || 1);
      const pctB = (b.achievements_unlocked || 0) / (b.achievements_total || 1);
      return pctB - pctA; // ближайший к 100% первым
    },
    limit: 100,
  },
  {
    id: 'hidden_gems',
    title: `${icons.diamond} Не тронуто`,
    subtitle: 'Куплено, но ни разу не запускалось',
    filter: (game) => isNotStarted(game),
    sort: () => Math.random() - 0.5,
    limit: 12,
  },
];

export function buildPlaylists(games) {
  const hltbMap = getAll(games);

  const enriched = games.map((game) => ({
    ...game,
    hltb: hltbMap[String(game.appid)] || null,
  }));

  return PLAYLISTS.map((playlist) => {
    const matched = enriched
      .filter((game) => playlist.filter(game, game.hltb))
      .sort(playlist.sort)
      .slice(0, playlist.limit);

    return {
      id: playlist.id,
      title: playlist.title,
      subtitle: playlist.subtitle,
      games: matched,
      isEmpty: matched.length === 0,
    };
  }).filter((playlist) => !playlist.isEmpty);
}
