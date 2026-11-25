// Постиженията — общи за клиента и сървъра. Прогресът се смята от PlayerStats (src/lib/achievements/server.ts).

export interface PlayerStats {
  songsSolved: number;
  flash: number;
  retroSolved: number;
  newSolved: number;
  gamesFinished: number;
  gameTypes: string[];
  perfectGames: number;
  perfectDaily: number;
  dailyGames: number;
  streakBest: number;
  nightGames: number;
  earlyGames: number;
  totalPoints: number;
  /** Най-добрата точност (0–1) върху артист с поне 50 изиграни песни; 0, ако няма такъв */
  expertAccuracy: number;
  albumsCollected: number;
  coverFirstStep: number;
  yearExact: number;
  orderPerfect: number;
  pairStreakBest: number;
  singerCorrect: number;
  wordCorrect: number;
  roomGames: number;
  roomWins: number;
}

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  target: number;
  progress: (s: PlayerStats) => number;
  secret?: boolean;
}

export const ALL_GAME_TYPES = ["listen", "cover", "newer", "higher", "year", "order", "album", "singer", "word"] as const;

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: "first_song", name: "Първа песен", description: "Познай първата си песен", icon: "🎵", target: 1, progress: (s) => s.songsSolved },
  { code: "flash", name: "Светкавица", description: "Познай песен от 0.2 секунди", icon: "⚡", target: 1, progress: (s) => s.flash },
  { code: "flash_10", name: "10 от 0.2 сек", description: "Познай 10 песни от 0.2 секунди", icon: "🌩️", target: 10, progress: (s) => s.flash },
  { code: "flash_50", name: "Абсолютен слух", description: "Познай 50 песни от 0.2 секунди", icon: "👂", target: 50, progress: (s) => s.flash },
  { code: "songs_100", name: "Меломан", description: "Познай 100 песни", icon: "🎶", target: 100, progress: (s) => s.songsSolved },
  { code: "songs_500", name: "Жива енциклопедия", description: "Познай 500 песни", icon: "📚", target: 500, progress: (s) => s.songsSolved },
  { code: "perfect_game", name: "Без грешка", description: "Познай всичките 10 песни в една игра", icon: "💯", target: 1, progress: (s) => s.perfectGames },
  { code: "perfect_day", name: "Перфектен ден", description: "10 от 10 в дневното предизвикателство", icon: "🌟", target: 1, progress: (s) => s.perfectDaily },
  { code: "daily_first", name: "Всеки ден по малко", description: "Изиграй дневно предизвикателство", icon: "📅", target: 1, progress: (s) => s.dailyGames },
  { code: "streak_3", name: "Загрявка", description: "Дневното 3 дни поред", icon: "🔥", target: 3, progress: (s) => s.streakBest },
  { code: "streak_7", name: "7 дни серия", description: "Дневното 7 дни поред", icon: "🔥", target: 7, progress: (s) => s.streakBest },
  { code: "streak_30", name: "30 дни серия", description: "Дневното 30 дни поред", icon: "🏅", target: 30, progress: (s) => s.streakBest },
  { code: "games_10", name: "Редовен", description: "Довърши 10 игри", icon: "🎮", target: 10, progress: (s) => s.gamesFinished },
  { code: "games_100", name: "Ветеран", description: "Довърши 100 игри", icon: "🎖️", target: 100, progress: (s) => s.gamesFinished },
  { code: "night_owl", name: "Нощна птица", description: "Изиграй игра между полунощ и 5 сутринта", icon: "🦉", target: 1, progress: (s) => s.nightGames },
  { code: "early_bird", name: "Ранобудник", description: "Изиграй игра между 5 и 7 сутринта", icon: "🐦", target: 1, progress: (s) => s.earlyGames },
  { code: "retro_soul", name: "Ретро душа", description: "Познай 50 песни от 90-те и 2000-те", icon: "📼", target: 50, progress: (s) => s.retroSolved },
  { code: "new_wave", name: "В крак с модата", description: "Познай 50 песни от 2020 г. насам", icon: "🆕", target: 50, progress: (s) => s.newSolved },
  {
    code: "artist_expert",
    name: "Експерт по артист",
    description: "90%+ познати от поне 50 изиграни песни на един артист",
    icon: "🎓",
    target: 90,
    progress: (s) => Math.floor(s.expertAccuracy * 100),
  },
  { code: "album_collector", name: "Колекционер на албуми", description: "Познай 25 различни албума", icon: "💿", target: 25, progress: (s) => s.albumsCollected },
  { code: "cover_eye", name: "Око за корици", description: "Познай корица още на първата стъпка", icon: "👁️", target: 1, progress: (s) => s.coverFirstStep },
  { code: "year_exact", name: "Машина на времето", description: "Познай точната година 10 пъти", icon: "⏳", target: 10, progress: (s) => s.yearExact },
  { code: "order_perfect", name: "Хронолог", description: "5 перфектни подреждания по години", icon: "🗂️", target: 5, progress: (s) => s.orderPerfect },
  { code: "pair_streak", name: "Неудържим", description: "Серия от 15 в „Коя е по-нова/популярна“", icon: "🚀", target: 15, progress: (s) => s.pairStreakBest },
  { code: "singer_50", name: "Разпознавам гласове", description: "Познай изпълнителя 50 пъти", icon: "🎙️", target: 50, progress: (s) => s.singerCorrect },
  { code: "word_25", name: "Думичка по думичка", description: "Познай 25 липсващи думи в заглавия", icon: "🧩", target: 25, progress: (s) => s.wordCorrect },
  { code: "room_5", name: "Душата на купона", description: "Изиграй 5 игри в стая с приятели", icon: "🪩", target: 5, progress: (s) => s.roomGames },
  { code: "room_winner", name: "Победител в стая", description: "Спечели игра в стая с приятели", icon: "🏆", target: 1, progress: (s) => s.roomWins },
  {
    code: "all_modes",
    name: "Изиграл всички режими",
    description: "Довърши поне по една игра от всичките 9 игри",
    icon: "🌈",
    target: ALL_GAME_TYPES.length,
    progress: (s) => ALL_GAME_TYPES.filter((t) => s.gameTypes.includes(t)).length,
  },
  { code: "points_10k", name: "10 000 точки", description: "Събери 10 000 точки общо", icon: "💎", target: 10000, progress: (s) => s.totalPoints },
];
