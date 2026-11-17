-- Origem do cadastro e oferta da campanha /beta, gravadas na criação da organização.
ALTER TABLE "organizations" ADD COLUMN "signup_source" JSONB;
ALTER TABLE "organizations" ADD COLUMN "signup_offer" TEXT;
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" TIMESTAMP(3);

-- WhatsApp opcional deixado na tela /conectar, antes do OAuth (nível plataforma).
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "source" JSONB,
    "offer" TEXT,
    "converted_organization_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");
CREATE INDEX "leads_converted_organization_id_idx" ON "leads"("converted_organization_id");

ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_organization_id_fkey" FOREIGN KEY ("converted_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
