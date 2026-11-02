"use server";

import { refresh } from "next/cache";
import { getTrack, isDeezerId } from "@/lib/deezer";
import { logIn, logOut, requireAdmin } from "@/lib/admin-auth";
import { findArtist, importArtist, latinName, type ArtistCandidate } from "@/lib/import-artist";
import { transliterate } from "@/lib/normalize";
import { prisma } from "@/lib/prisma";
import { upsertDeezerTrack } from "@/lib/tracks";

export interface ActionResult {
  ok: boolean;
  message: string;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// --- Вход ---

export async function loginAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (await logIn(text(form, "password"))) {
    refresh();
    return { ok: true, message: "" };
  }
  // Малко забавяне срещу налучкване.
  await new Promise((r) => setTimeout(r, 600));
  return { ok: false, message: "Грешна парола" };
}

export async function logoutAction(): Promise<void> {
  await logOut();
  refresh();
}

// --- Артисти ---

export interface CandidatesResult {
  name: string;
  /** Препоръчан профил, ако съвпадението е сигурно. */
  recommendedId: number | null;
  candidates: ArtistCandidate[];
  error?: string;
}

export async function findArtistCandidates(name: string, international = false): Promise<CandidatesResult> {
  await requireAdmin();
  const clean = name.trim();
  if (clean.length < 2) return { name: clean, recommendedId: null, candidates: [], error: "Въведи име" };
  const match = await findArtist(clean, { international });
  if (match.kind === "none") return { name: clean, recommendedId: null, candidates: [], error: "Не е намерен в Deezer" };
  if (match.kind === "certain") {
    return { name: clean, recommendedId: match.candidate.id, candidates: [match.candidate, ...match.others] };
  }
  return { name: clean, recommendedId: null, candidates: match.candidates };
}

export async function importArtistAction(input: {
  name: string;
  deezerId: number;
  isPopFolk: boolean;
  genreSlugs: string[];
}): Promise<ActionResult> {
  await requireAdmin();
  const result = await importArtist(input.name, input.deezerId, {
    isPopFolk: input.isPopFolk,
    genreSlugs: input.genreSlugs,
  });
  refresh();
  return {
    ok: true,
    message: `${input.name}: ${result.imported} песни${result.skippedNoPreview ? `, ${result.skippedNoPreview} без откъс` : ""}`,
  };
}

export async function refreshArtistAction(artistId: string): Promise<void> {
  await requireAdmin();
  const artist = await prisma.artist.findUniqueOrThrow({ where: { id: artistId } });
  if (artist.deezerId) await importArtist(artist.name, Number(artist.deezerId));
  refresh();
}

export async function togglePopFolkAction(artistId: string): Promise<void> {
  await requireAdmin();
  const artist = await prisma.artist.findUniqueOrThrow({ where: { id: artistId } });
  await prisma.artist.update({ where: { id: artistId }, data: { isPopFolk: !artist.isPopFolk } });
  refresh();
}

export async function setArtistGenresAction(artistId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const slugs = form.getAll("genre").filter((v): v is string => typeof v === "string");
  await prisma.artist.update({
    where: { id: artistId },
    data: { genres: { set: slugs.map((slug) => ({ slug })) } },
  });
  refresh();
}

export async function renameArtistAction(artistId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const name = text(form, "name");
  if (!name) return;
  await prisma.artist.update({ where: { id: artistId }, data: { name, nameLatin: latinName(name) } });
  refresh();
}

export async function deleteArtistAction(artistId: string): Promise<void> {
  await requireAdmin();
  // Песните, които не са в плейлист и не са играни, се трият; останалите остават без артист.
  await prisma.track.deleteMany({ where: { artistId, playlists: { none: {} }, rounds: { none: {} } } });
  await prisma.artist.delete({ where: { id: artistId } });
  refresh();
}

// --- Жанрове ---

export async function createGenreAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = text(form, "name");
  if (!name) return { ok: false, message: "Въведи име" };
  const slug = transliterate(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) return { ok: false, message: "Невалидно име" };
  if (await prisma.genre.findUnique({ where: { slug } })) return { ok: false, message: "Такъв жанр вече има" };
  await prisma.genre.create({ data: { slug, name } });
  refresh();
  return { ok: true, message: `Жанр „${name}“ е създаден` };
}

export async function deleteGenreAction(genreId: string): Promise<void> {
  await requireAdmin();
  await prisma.genre.delete({ where: { id: genreId } });
  refresh();
}

// --- Curated плейлисти ---

export async function createPlaylistAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = text(form, "name");
  if (!name) return { ok: false, message: "Въведи име" };
  const category = text(form, "category") || null;
  await prisma.playlist.create({
    data: { name, description: text(form, "description") || null, source: "curated", category },
  });
  refresh();
  return { ok: true, message: `Плейлистът „${name}“ е създаден` };
}

export async function deletePlaylistAction(playlistId: string): Promise<void> {
  await requireAdmin();
  await prisma.playlist.delete({ where: { id: playlistId } });
  refresh();
}

export async function updatePlaylistAction(playlistId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const name = text(form, "name");
  if (!name) return;
  await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      name,
      description: text(form, "description") || null,
      category: text(form, "category") || null,
      sortOrder: Number(text(form, "sortOrder")) || 0,
    },
  });
  refresh();
}

export async function addTrackToPlaylistAction(playlistId: string, deezerId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isDeezerId(deezerId)) return { ok: false, message: "Невалидна песен" };
  const full = await getTrack(deezerId);
  if (!full.preview) return { ok: false, message: "Тази песен няма откъс в Deezer" };
  const track = await upsertDeezerTrack(full);
  const exists = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId, trackId: track.id } },
  });
  if (exists) return { ok: false, message: "Песента вече е в плейлиста" };
  const last = await prisma.playlistTrack.aggregate({ where: { playlistId }, _max: { position: true } });
  await prisma.playlistTrack.create({
    data: { playlistId, trackId: track.id, position: (last._max.position ?? -1) + 1 },
  });
  refresh();
  return { ok: true, message: `Добавена: ${full.title} – ${full.artist.name}` };
}

export async function removeTrackFromPlaylistAction(playlistId: string, trackId: string): Promise<void> {
  await requireAdmin();
  await prisma.playlistTrack.delete({ where: { playlistId_trackId: { playlistId, trackId } } });
  refresh();
}
