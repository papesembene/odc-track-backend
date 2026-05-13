CREATE TABLE "MasterDataSnapshot" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterDataSnapshot_pkey" PRIMARY KEY ("key")
);
