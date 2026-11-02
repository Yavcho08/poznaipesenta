-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'lobby',
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL DEFAULT -1,
    "roundStartAt" DATETIME,
    "roundEndAt" DATETIME,
    "hostId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoomPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomPlayer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomRound" (
    "roomId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "trackId" TEXT NOT NULL,

    PRIMARY KEY ("roomId", "index"),
    CONSTRAINT "RoomRound_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomRound_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoomGuess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "deezerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomGuess_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomGuess_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_token_key" ON "RoomPlayer"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RoomPlayer_roomId_name_key" ON "RoomPlayer"("roomId", "name");

-- CreateIndex
CREATE INDEX "RoomGuess_roomId_roundIndex_idx" ON "RoomGuess"("roomId", "roundIndex");

-- CreateIndex
CREATE UNIQUE INDEX "RoomGuess_playerId_roundIndex_step_key" ON "RoomGuess"("playerId", "roundIndex", "step");
