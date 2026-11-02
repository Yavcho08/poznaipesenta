-- AlterTable
ALTER TABLE "GameSession" ADD COLUMN     "challengeCode" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "nextCode" TEXT;

-- CreateTable
CREATE TABLE "RoomReaction" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomReaction_roomId_createdAt_idx" ON "RoomReaction"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameSession_challengeCode_key" ON "GameSession"("challengeCode");

-- AddForeignKey
ALTER TABLE "RoomReaction" ADD CONSTRAINT "RoomReaction_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReaction" ADD CONSTRAINT "RoomReaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
