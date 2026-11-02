// Откъде идват песните за играта. Общо за клиента и сървъра.

export type GameSource =
  | { type: "popfolk" }
  | { type: "genre"; slug: string }
  | { type: "artists"; ids: string[] }
  | { type: "playlist"; id: string };

export const DEFAULT_SOURCE: GameSource = { type: "popfolk" };

const ID = /^[\w-]{1,64}$/;

/** Проверява непознат вход (JSON от заявка или от базата). */
export function parseSource(value: unknown): GameSource | null {
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  switch (value.type) {
    case "popfolk":
      return { type: "popfolk" };
    case "genre":
      return "slug" in value && typeof value.slug === "string" && ID.test(value.slug)
        ? { type: "genre", slug: value.slug }
        : null;
    case "playlist":
      return "id" in value && typeof value.id === "string" && ID.test(value.id) ? { type: "playlist", id: value.id } : null;
    case "artists": {
      if (!("ids" in value) || !Array.isArray(value.ids)) return null;
      const ids = value.ids.filter((id): id is string => typeof id === "string" && ID.test(id)).slice(0, 50);
      return ids.length > 0 ? { type: "artists", ids } : null;
    }
    default:
      return null;
  }
}

/** URL параметри за /igra: ?type=genre&id=rap, ?type=artists&id=a,b */
export function sourceToQuery(source: GameSource): string {
  switch (source.type) {
    case "popfolk":
      return "type=popfolk";
    case "genre":
      return `type=genre&id=${encodeURIComponent(source.slug)}`;
    case "playlist":
      return `type=playlist&id=${encodeURIComponent(source.id)}`;
    case "artists":
      return `type=artists&id=${source.ids.map(encodeURIComponent).join(",")}`;
  }
}

export function sourceFromQuery(params: { type?: string | string[]; id?: string | string[] }): GameSource {
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const parsed =
    type === "genre"
      ? parseSource({ type, slug: id })
      : type === "playlist"
        ? parseSource({ type, id })
        : type === "artists"
          ? parseSource({ type, ids: id.split(",") })
          : null;
  return parsed ?? DEFAULT_SOURCE;
}
