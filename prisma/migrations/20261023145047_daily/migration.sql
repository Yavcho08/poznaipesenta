-- CreateTable
CREATE TABLE "DailyChallenge" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "trackIds" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
