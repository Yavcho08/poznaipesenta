import type { Answer } from "@/lib/game/rules";

/** Брой рундове, които домакинът може да избере. */
export const ROOM_ROUND_OPTIONS = [5, 10, 15] as const;

/** Разрешените емоджи реакции. */
export const REACTIONS = ["🔥", "😂", "😱", "👏", "🤯", "😭"] as const;

export interface RoomReactionView {
  id: string;
  emoji: string;
  name: string;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  online: boolean;
  /** Стъпката, на която е познал текущата песен; null = още не. */
  solvedStep: number | null;
  /** Стъпките, на които е опитал или пропуснал в текущия рунд. */
  triedSteps: number[];
  /** Готов с текущата песен (познал или изчерпал опитите). */
  done: boolean;
}

export interface RoomState {
  code: string;
  label: string;
  status: "lobby" | "playing" | "finished";
  /** Date.now() на сървъра — за синхронизация на часовника. */
  serverNow: number;
  totalRounds: number;
  roundIndex: number;
  roundStartAt: number | null;
  roundEndAt: number | null;
  me: { id: string; name: string; isHost: boolean } | null;
  players: RoomPlayerView[];
  myGuesses: { step: number; kind: "guess" | "skip"; title: string; artist: string; correct: boolean }[];
  /** Приключилите рундове с верния отговор и точките на всеки играч. */
  history: { index: number; answer: Answer; points: Record<string, number> }[];
  /** Код на стаята-реванш, ако някой вече я е създал. */
  nextCode: string | null;
  /** Реакциите от последните няколко секунди. */
  reactions: RoomReactionView[];
}
