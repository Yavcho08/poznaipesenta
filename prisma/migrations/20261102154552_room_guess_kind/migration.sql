-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoomGuess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "step" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'guess',
    "deezerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoomGuess_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoomGuess_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "RoomPlayer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RoomGuess" ("artist", "correct", "createdAt", "deezerId", "id", "playerId", "points", "roomId", "roundIndex", "step", "title") SELECT "artist", "correct", "createdAt", "deezerId", "id", "playerId", "points", "roomId", "roundIndex", "step", "title" FROM "RoomGuess";
DROP TABLE "RoomGuess";
ALTER TABLE "new_RoomGuess" RENAME TO "RoomGuess";
CREATE INDEX "RoomGuess_roomId_roundIndex_idx" ON "RoomGuess"("roomId", "roundIndex");
CREATE UNIQUE INDEX "RoomGuess_playerId_roundIndex_step_key" ON "RoomGuess"("playerId", "roundIndex", "step");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
