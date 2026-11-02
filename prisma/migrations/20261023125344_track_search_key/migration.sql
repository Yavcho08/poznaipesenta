-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deezerId" TEXT NOT NULL,
    "isrc" TEXT,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistId" TEXT,
    "albumCover" TEXT,
    "releaseYear" INTEGER,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "searchKey" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Track_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Track" ("albumCover", "artistId", "artistName", "createdAt", "deezerId", "id", "isrc", "rank", "releaseYear", "title", "updatedAt") SELECT "albumCover", "artistId", "artistName", "createdAt", "deezerId", "id", "isrc", "rank", "releaseYear", "title", "updatedAt" FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
CREATE UNIQUE INDEX "Track_deezerId_key" ON "Track"("deezerId");
CREATE INDEX "Track_isrc_idx" ON "Track"("isrc");
CREATE INDEX "Track_artistId_idx" ON "Track"("artistId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
