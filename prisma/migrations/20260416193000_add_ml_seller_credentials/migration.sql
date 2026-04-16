-- Encrypted ML OAuth tokens per seller (webhook + server-side refresh).
CREATE TABLE "ml_seller_credentials" (
    "ml_user_id" INTEGER NOT NULL,
    "refresh_enc" TEXT NOT NULL,
    "access_enc" TEXT,
    "access_expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_seller_credentials_pkey" PRIMARY KEY ("ml_user_id")
);

ALTER TABLE "ml_seller_credentials" ALTER COLUMN "updated_at" DROP DEFAULT;