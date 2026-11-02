// Точно пускане на клипове с Web Audio API.
// HTMLAudioElement не е подходящ: currentTime/pause имат десетки ms закъснение,
// а за 0.2-секунден клип това е половината звук.

const FADE_OUT_S = 0.03;
// Много кратък fade-in срещу пукане, ако preview-то започва насред звук.
const FADE_IN_S = 0.005;

/** Декодиран откъс + откъде да започват клиповете (припевът, изчислен на сървъра). */
export interface Clip {
  buffer: AudioBuffer;
  /** Секунди в откъса; всички стъпки (0.2…10 сек.) започват оттук. */
  start: number;
}

export interface PlayOptions {
  onEnded?: () => void;
  /** Момент в ctx.currentTime (за синхронно пускане в мултиплейър). */
  at?: number;
  /** Друго начало в откъса (напр. 0 за „Чуй целия откъс“). */
  from?: number;
}

export interface Playback {
  /** ctx.currentTime в момента на старта. */
  startedAt: number;
  duration: number;
}

/** Сила на звука 0–1 → усилване. Квадратът звучи по-равномерно на плъзгача (ухото е логаритмично). */
function volumeToGain(volume: number): number {
  const v = Math.max(0, Math.min(1, volume));
  return v * v;
}

export class ClipPlayer {
  private ctx: AudioContext | null = null;
  /** Обща сила на звука — всички клипове минават през него. */
  private master: GainNode | null = null;
  private volume = 1;
  private active: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  /** Трябва да се извика синхронно в обработчик на клик (autoplay политики). */
  unlock(): AudioContext {
    // iPhone (Safari 16.4+): без това Web Audio се заглушава от беззвучния режим
    // и може да прекъсва — "playback" го третира като музика, както <audio>.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = volumeToGain(this.volume);
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** 0 = без звук, 1 = пълна сила. Може и преди първото пускане. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.ctx && this.master) {
      // Плавно (~50 ms), за да няма пукане при влачене на плъзгача.
      this.master.gain.setTargetAtTime(volumeToGain(volume), this.ctx.currentTime, 0.015);
    }
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  async load(url: string, signal?: AbortSignal): Promise<Clip> {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const message =
        typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "Звукът не можа да се зареди";
      throw new Error(message);
    }
    const hook = Number(res.headers.get("X-Hook-Start"));
    const bytes = await res.arrayBuffer();
    const buffer = await this.unlock().decodeAudioData(bytes);
    // Началото трябва да остави място за най-дългия клип (10 сек.).
    const start = Number.isFinite(hook) ? Math.max(0, Math.min(hook, buffer.duration - 10)) : 0;
    return { buffer, start };
  }

  /**
   * Пуска клипа от началото му (припева) за точно `duration` секунди.
   * Ако моментът `at` вече е минал, клипът продължава от съответната позиция, за да остане в синхрон.
   */
  play(clip: Clip, duration: number, { onEnded, at, from }: PlayOptions = {}): Playback {
    const ctx = this.unlock();
    this.stop();

    const { buffer } = clip;
    const begin = from ?? clip.start;
    const length = Math.min(duration, buffer.duration - begin);
    const scheduled = at ?? ctx.currentTime;
    const t0 = Math.max(scheduled, ctx.currentTime);
    const offset = t0 - scheduled;
    const remaining = length - offset;
    if (remaining <= FADE_OUT_S) {
      onEnded?.();
      return { startedAt: scheduled, duration: length };
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain).connect(this.master ?? ctx.destination);

    const end = t0 + remaining;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + FADE_IN_S);
    gain.gain.setValueAtTime(1, Math.max(t0 + FADE_IN_S, end - FADE_OUT_S));
    gain.gain.linearRampToValueAtTime(0, end);

    source.start(t0, begin + offset, remaining);
    source.onended = () => {
      if (this.active?.source === source) this.active = null;
      source.disconnect();
      gain.disconnect();
      onEnded?.();
    };
    this.active = { source, gain };
    return { startedAt: scheduled, duration: length };
  }

  stop(): void {
    if (!this.active || !this.ctx) return;
    const { source, gain } = this.active;
    this.active = null;
    // Бърз fade и спиране, за да няма пукане при прекъсване.
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + FADE_OUT_S);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.stop(t + FADE_OUT_S);
  }

  /**
   * Кратък синтезиран звук: „right“ — две възходящи ноти, „wrong“ — нисък „бъз“.
   * Не спира клипа и минава през общата сила на звука (следва плъзгача).
   */
  sfx(kind: "right" | "wrong"): void {
    const ctx = this.unlock();
    const out = this.master ?? ctx.destination;
    const notes = kind === "right" ? [{ f: 784, t: 0 }, { f: 1175, t: 0.09 }] : [{ f: 196, t: 0 }, { f: 147, t: 0.11 }];
    const t0 = ctx.currentTime + 0.01;
    for (const { f, t } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "right" ? "sine" : "square";
      osc.frequency.value = f;
      const peak = kind === "right" ? 0.18 : 0.07;
      gain.gain.setValueAtTime(0, t0 + t);
      gain.gain.linearRampToValueAtTime(peak, t0 + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.16);
      osc.connect(gain).connect(out);
      osc.start(t0 + t);
      osc.stop(t0 + t + 0.18);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    }
  }

  close(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
  }
}
