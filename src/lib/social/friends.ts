import "server-only";
import { levelFromXp } from "@/lib/achievements/progress";
import { GameError } from "@/lib/game/server";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/room/realtime";

// Приятели и покани за стая. Само за влезли потребители с име.

export interface FriendView {
  userId: string;
  username: string;
  avatarUrl: string | null;
  level: number;
}

export interface FriendRequestView {
  id: string;
  user: FriendView;
  createdAt: Date;
}

export interface InviteView {
  id: string;
  code: string;
  label: string;
  status: string;
  from: FriendView;
  createdAt: Date;
  seen: boolean;
}

/** Покани по-стари от това не се показват (стаите са краткотрайни). */
const INVITE_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_FRIENDS = 200;

type ProfileLite = { id: string; username: string | null; avatarUrl: string | null; xp: number };

function view(p: ProfileLite): FriendView {
  return { userId: p.id, username: p.username ?? "Играч", avatarUrl: p.avatarUrl, level: levelFromXp(p.xp) };
}

const profileSelect = { id: true, username: true, avatarUrl: true, xp: true } as const;

export async function listFriends(userId: string): Promise<FriendView[]> {
  const rows = await prisma.friendship.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    include: { requester: { select: profileSelect }, addressee: { select: profileSelect } },
  });
  return rows
    .map((f) => view(f.requesterId === userId ? f.addressee : f.requester))
    .sort((a, b) => a.username.localeCompare(b.username, "bg"));
}

export async function listRequests(userId: string): Promise<{ incoming: FriendRequestView[]; outgoing: FriendRequestView[] }> {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendship.findMany({ where: { addresseeId: userId, status: "pending" }, include: { requester: { select: profileSelect } }, orderBy: { createdAt: "desc" } }),
    prisma.friendship.findMany({ where: { requesterId: userId, status: "pending" }, include: { addressee: { select: profileSelect } }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    incoming: incoming.map((f) => ({ id: f.id, user: view(f.requester), createdAt: f.createdAt })),
    outgoing: outgoing.map((f) => ({ id: f.id, user: view(f.addressee), createdAt: f.createdAt })),
  };
}

/** Молба за приятелство по име. Ако другият вече е поканил теб — направо сте приятели. */
export async function sendFriendRequest(userId: string, rawUsername: string): Promise<{ status: "sent" | "accepted"; username: string }> {
  const username = rawUsername.trim();
  if (username.length < 2) throw new GameError("Въведи името на приятеля");
  const other = await prisma.profile.findFirst({ where: { username: { equals: username, mode: "insensitive" } }, select: profileSelect });
  if (!other?.username) throw new GameError("Няма играч с това име");
  if (other.id === userId) throw new GameError("Това си ти 🙂");

  const count = await prisma.friendship.count({ where: { OR: [{ requesterId: userId }, { addresseeId: userId }] } });
  if (count >= MAX_FRIENDS) throw new GameError("Стигнал си лимита от приятели");

  const existing = await prisma.friendship.findFirst({
    where: { OR: [{ requesterId: userId, addresseeId: other.id }, { requesterId: other.id, addresseeId: userId }] },
  });
  if (existing?.status === "accepted") throw new GameError(`С ${other.username} вече сте приятели`);
  if (existing && existing.requesterId === userId) throw new GameError("Вече си изпратил молба — чака отговор");
  if (existing) {
    await prisma.friendship.update({ where: { id: existing.id }, data: { status: "accepted", respondedAt: new Date() } });
    notifyUser(other.id);
    return { status: "accepted", username: other.username };
  }
  await prisma.friendship.create({ data: { requesterId: userId, addresseeId: other.id } });
  notifyUser(other.id);
  return { status: "sent", username: other.username };
}

export async function respondToRequest(userId: string, requestId: string, accept: boolean): Promise<void> {
  const request = await prisma.friendship.findUnique({ where: { id: requestId } });
  if (!request || request.addresseeId !== userId || request.status !== "pending") throw new GameError("Молбата не е намерена", 404);
  if (accept) {
    await prisma.friendship.update({ where: { id: requestId }, data: { status: "accepted", respondedAt: new Date() } });
    notifyUser(request.requesterId);
  } else {
    await prisma.friendship.delete({ where: { id: requestId } });
  }
}

/** Премахва приятел или оттегля изпратена молба. */
export async function removeFriend(userId: string, otherId: string): Promise<void> {
  await prisma.friendship.deleteMany({
    where: { OR: [{ requesterId: userId, addresseeId: otherId }, { requesterId: otherId, addresseeId: userId }] },
  });
}

async function areFriends(a: string, b: string): Promise<boolean> {
  return (
    (await prisma.friendship.count({
      where: { status: "accepted", OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
    })) > 0
  );
}

/** Покана за стая към приятели. Канещият трябва да е в стаята (влязъл с профила си). */
export async function inviteToRoom(userId: string, code: string, friendIds: string[]): Promise<number> {
  const room = await prisma.room.findUnique({ where: { code: code.toUpperCase() }, select: { id: true, status: true } });
  if (!room) throw new GameError("Стаята не е намерена", 404);
  if (room.status === "finished") throw new GameError("Играта в тази стая вече свърши", 409);
  const inRoom = await prisma.roomPlayer.count({ where: { roomId: room.id, userId } });
  if (!inRoom) throw new GameError("Влез в стаята с профила си, за да каниш", 403);

  let sent = 0;
  for (const friendId of [...new Set(friendIds)].slice(0, 20)) {
    if (friendId === userId || !(await areFriends(userId, friendId))) continue;
    await prisma.roomInvite.upsert({
      where: { roomId_toUserId: { roomId: room.id, toUserId: friendId } },
      update: { fromUserId: userId, createdAt: new Date(), seenAt: null },
      create: { roomId: room.id, fromUserId: userId, toUserId: friendId },
    });
    notifyUser(friendId);
    sent++;
  }
  return sent;
}

export async function listInvites(userId: string): Promise<InviteView[]> {
  const rows = await prisma.roomInvite.findMany({
    where: { toUserId: userId, createdAt: { gte: new Date(Date.now() - INVITE_TTL_MS) }, room: { status: { not: "finished" } } },
    include: { room: { select: { code: true, label: true, status: true } }, fromUser: { select: profileSelect } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.room.code,
    label: r.room.label,
    status: r.room.status,
    from: view(r.fromUser),
    createdAt: r.createdAt,
    seen: r.seenAt !== null,
  }));
}

export async function markInvitesSeen(userId: string): Promise<void> {
  await prisma.roomInvite.updateMany({ where: { toUserId: userId, seenAt: null }, data: { seenAt: new Date() } });
}

export interface Notifications {
  requests: number;
  invites: InviteView[];
}

export async function getNotifications(userId: string): Promise<Notifications> {
  const [requests, invites] = await Promise.all([
    prisma.friendship.count({ where: { addresseeId: userId, status: "pending" } }),
    listInvites(userId),
  ]);
  return { requests, invites };
}
