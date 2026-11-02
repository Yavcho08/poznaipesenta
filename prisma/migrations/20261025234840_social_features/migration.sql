-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN "challengeCode" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN "nextCode" TEXT;

-- CreateTable
CREATE TABLE "RoomReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomReaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomReaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RoomReaction_roomId_createdAt_idx" ON "RoomReaction"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_challengeCode_key" ON "GameSession"("challengeCode");
