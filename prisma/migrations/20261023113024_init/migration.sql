-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nameLatin" TEXT,
    "deezerId" TEXT,
    "imageUrl" TEXT,
    "isPopFolk" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Genre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deezerId" TEXT NOT NULL,
    "isrc" TEXT,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistId" TEXT,
    "albumCover" TEXT,
    "releaseYear" INTEGER,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Track_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    PRIMARY KEY ("playlistId", "trackId"),
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistTrack_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT,
    "sourceRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "trackId" TEXT NOT NULL,
    "solvedAtStep" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "guesses" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Round_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Round_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "playerName" TEXT,
    "total" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Score_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ArtistToGenre" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ArtistToGenre_A_fkey" FOREIGN KEY ("A") REFERENCES "Artist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ArtistToGenre_B_fkey" FOREIGN KEY ("B") REFERENCES "Genre" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_deezerId_key" ON "Artist"("deezerId");

-- CreateIndex
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Track_deezerId_key" ON "Track"("deezerId");

-- CreateIndex
CREATE INDEX "Track_isrc_idx" ON "Track"("isrc");

-- CreateIndex
CREATE INDEX "Track_artistId_idx" ON "Track"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_source_externalId_key" ON "Playlist"("source", "externalId");

-- CreateIndex
CREATE INDEX "PlaylistTrack_playlistId_position_idx" ON "PlaylistTrack"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Round_sessionId_index_key" ON "Round"("sessionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Score_sessionId_key" ON "Score"("sessionId");

-- CreateIndex
CREATE INDEX "Score_total_idx" ON "Score"("total");

-- CreateIndex
CREATE UNIQUE INDEX "_ArtistToGenre_AB_unique" ON "_ArtistToGenre"("A", "B");

-- CreateIndex
CREATE INDEX "_ArtistToGenre_B_index" ON "_ArtistToGenre"("B");
