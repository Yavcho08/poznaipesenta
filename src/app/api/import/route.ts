import type { NextRequest } from "next/server";
import { ImportError, parseImportRequest, prepareImport, type ImportEvent } from "@/lib/import/run";
import { SpotifyApiError } from "@/lib/import/spotify-api";
import { SpotifyEmbedError } from "@/lib/import/spotify-embed";

// Голям Spotify плейлист (1000+ песни) се съпоставя с Deezer за няколко минути
// (ограничението на Deezer е ~45 заявки / 5 сек.). 300 сек. е максимумът на безплатния план на Vercel.
export const maxDuration = 300;

// Внос на плейлист. Отговорът е NDJSON поток: по един ImportEvent на ред (прогрес на живо).
export async function POST(req: NextRequest) {
  const request = parseImportRequest(await req.json().catch(() => null));
  if (!request) return Response.json({ error: "Невалидна заявка" }, { status: 400 });

  let prepared;
  try {
    prepared = await prepareImport(request);
  } catch (error) {
    if (error instanceof ImportError || error instanceof SpotifyEmbedError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SpotifyApiError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Вносът не успя. Опитай пак." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ImportEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      emit({ type: "start", name: prepared.name, total: prepared.total, notice: prepared.notice });
      try {
        await prepared.run(emit);
      } catch (error) {
        console.error(error);
        emit({ type: "error", message: "Вносът прекъсна. Опитай пак." });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
