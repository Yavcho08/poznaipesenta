import "server-only";
// Плейлисти: официални (куратирани от нас, видими за всички) и лични (внесени от потребител —
// вижда ги само собственикът; може да ги пусне и в стая, която той създава).

import type { Prisma } from "@/generated/prisma/client";
import type { GameSource } from "@/lib/game/source";
import { GameError } from "@/lib/game/server";
import { prisma } from "@/lib/prisma";

/** Официален = без собственик и куратиран (или отбелязан от админа с категория). */
export const OFFICIAL_PLAYLIST: Prisma.PlaylistWhereInput = { ownerId: null, OR: [{ source: "curated" }, { category: { not: null } }] };

/** Плейлистите, които потребителят вижда: официалните + своите. */
export function visiblePlaylists(userId: string | null): Prisma.PlaylistWhereInput {
  return userId ? { OR: [OFFICIAL_PLAYLIST, { ownerId: userId }] } : OFFICIAL_PLAYLIST;
}

const PRIVATE_MESSAGE = "Този плейлист е личен — вижда го само човекът, който го е внесъл.";

/** true, ако потребителят може да играе с този източник. */
export async function canUseSource(source: GameSource, userId: string | null): Promise<boolean> {
  if (source.type !== "playlist") return true;
  return (await prisma.playlist.count({ where: { id: source.id, ...visiblePlaylists(userId) } })) > 0;
}

/** Хвърля GameError 403, ако източникът е чужд личен плейлист (линк ?type=playlist&id=… към чужд плейлист). */
export async function assertSourceAccess(source: GameSource, userId: string | null): Promise<void> {
  if (!(await canUseSource(source, userId))) throw new GameError(PRIVATE_MESSAGE, 403);
}

export { PRIVATE_MESSAGE as PRIVATE_PLAYLIST_MESSAGE };
