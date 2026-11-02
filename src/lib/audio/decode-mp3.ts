import "server-only";
import { MPEGDecoder } from "mpg123-decoder";

// Парчета по 64 KB — декодерът (WASM) има ограничен входен буфер.
const CHUNK = 64 * 1024;

/** MP3 → моно PCM (средно от каналите). Само за анализ; звукът към браузъра се праща непокътнат. */
export async function decodeMp3Mono(bytes: Uint8Array): Promise<{ samples: Float32Array; sampleRate: number }> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const parts: Float32Array[] = [];
    let total = 0;
    let sampleRate = 44100;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const { channelData, samplesDecoded, sampleRate: rate } = decoder.decode(bytes.subarray(i, i + CHUNK));
      if (!samplesDecoded) continue;
      sampleRate = rate;
      const mono = new Float32Array(samplesDecoded);
      for (const channel of channelData) {
        for (let s = 0; s < samplesDecoded; s++) mono[s] += channel[s] / channelData.length;
      }
      parts.push(mono);
      total += samplesDecoded;
    }
    const samples = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      samples.set(part, offset);
      offset += part.length;
    }
    return { samples, sampleRate };
  } finally {
    decoder.free();
  }
}
