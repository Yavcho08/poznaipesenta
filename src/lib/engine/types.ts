// Общ „game engine“ за игрите без стъпките на слушането: рунд → отговор → точки → резултат.
// Типовете са общи за клиента и сървъра. Отговорът (answer) никога не стига до клиента,
// докато рундът не приключи — пази се в game_rounds.question.answer.

export const QUIZ_TYPES = ["cover", "newer", "higher", "year", "order", "album", "singer", "word"] as const;
export type QuizType = (typeof QUIZ_TYPES)[number];

export function isQuizType(value: unknown): value is QuizType {
  return typeof value === "string" && (QUIZ_TYPES as readonly string[]).includes(value);
}

export interface QuizMeta {
  type: QuizType;
  title: string;
  /** Кратко описание за картата */
  short: string;
  icon: string;
  /** Как се играе (на екрана преди старта) */
  howTo: string;
  /** "streak" = до първата грешка */
  length: number | "streak";
  /** Има ли смисъл „по избран артист“ */
  byArtist: boolean;
  /** Има звук */
  audio: boolean;
}

export const QUIZZES: Record<QuizType, QuizMeta> = {
  cover: {
    type: "cover",
    title: "Познай албума по корицата",
    short: "Корицата се изяснява на стъпки",
    icon: "🖼️",
    howTo: "Корицата започва силно пикселизирана. Избери албума — всеки грешен отговор или „Покажи повече“ я изяснява. По-рано = повече точки.",
    length: 10,
    byArtist: true,
    audio: false,
  },
  newer: {
    type: "newer",
    title: "Коя е по-нова?",
    short: "Серия до първата грешка",
    icon: "🆕",
    howTo: "Две песни — избери коя е излязла по-късно. Играеш до първата грешка.",
    length: "streak",
    byArtist: true,
    audio: false,
  },
  higher: {
    type: "higher",
    title: "Коя е по-популярна?",
    short: "По популярност в Deezer",
    icon: "📈",
    howTo: "Две песни — избери коя е по-слушана (по класацията на Deezer). Играеш до първата грешка.",
    length: "streak",
    byArtist: true,
    audio: false,
  },
  year: {
    type: "year",
    title: "Познай годината",
    short: "Колкото по-близо, толкова повече точки",
    icon: "📅",
    howTo: "Виждаш песента (можеш да я чуеш) — плъзни до годината, в която е излязла. Точно = 100 точки, всяка година разлика — по-малко.",
    length: 10,
    byArtist: true,
    audio: true,
  },
  order: {
    type: "order",
    title: "Подреди хронологично",
    short: "5 песни на един артист",
    icon: "🔢",
    howTo: "Подреди 5 песни на един артист от най-старата до най-новата.",
    length: 5,
    byArtist: true,
    audio: false,
  },
  album: {
    type: "album",
    title: "От кой албум е?",
    short: "Песен + 4 албума на артиста",
    icon: "💿",
    howTo: "Чуй песента и избери от кой албум на артиста е.",
    length: 10,
    byArtist: true,
    audio: true,
  },
  singer: {
    type: "singer",
    title: "Кой пее?",
    short: "Познай изпълнителя (и дуета)",
    icon: "🎙️",
    howTo: "Чуй откъса и избери кой пее. При дуетите — кой участва заедно с основния изпълнител.",
    length: 10,
    byArtist: false,
    audio: true,
  },
  word: {
    type: "word",
    title: "Липсващата дума",
    short: "Само заглавия, без текстове",
    icon: "🧩",
    howTo: "В заглавието на песента липсва дума — избери коя е. (Само заглавия — текстовете на песните не са наши.)",
    length: 10,
    byArtist: true,
    audio: false,
  },
};

/** Песен, както се показва на играча (id е ключ само в рамките на рунда). */
export interface SongCard {
  id: string;
  title: string;
  artist: string;
  cover: string | null;
}

export interface Option {
  id: string;
  label: string;
  sub?: string;
}

/** Въпросът, който вижда играчът. */
export type PublicQuestion =
  | { kind: "cover"; artist: string | null; options: Option[]; steps: number }
  | { kind: "pair"; prompt: string; left: SongCard; right: SongCard }
  | { kind: "year"; song: SongCard; min: number; max: number }
  | { kind: "order"; items: SongCard[] }
  | { kind: "choice"; prompt: string; song: SongCard | null; options: Option[] }
  | { kind: "word"; masked: string; artist: string; options: Option[] };

/** Верният отговор (само на сървъра до края на рунда). */
export type Answer =
  | { kind: "option"; id: string; label: string }
  | { kind: "pair"; correct: "left" | "right"; left: string; right: string }
  | { kind: "year"; year: number }
  | { kind: "order"; ids: string[]; years: Record<string, number> };

export type QuizInput =
  | { kind: "option"; id: string }
  | { kind: "skip" }
  | { kind: "pair"; pick: "left" | "right" }
  | { kind: "year"; year: number }
  | { kind: "order"; ids: string[] };

export interface Attempt {
  input: QuizInput;
  correct: boolean;
}

export interface QuizRoundView {
  index: number;
  question: PublicQuestion;
  attempts: Attempt[];
  /** Текуща стъпка (за корицата) */
  step: number;
  done: boolean;
  correct: boolean;
  points: number;
  /** Само за приключили рундове */
  answer: Answer | null;
  /** Песента зад рунда (за показване след края) */
  reveal: SongCard | null;
}

export interface QuizView {
  id: string;
  type: QuizType;
  label: string;
  daily: string | null;
  rounds: QuizRoundView[];
  currentRound: number | null;
  total: number;
  finished: boolean;
}

/** Въпросът в базата: публичната част + отговорът + песента за показване накрая. */
export interface StoredQuestion {
  public: PublicQuestion;
  answer: Answer;
  reveal: SongCard | null;
}
