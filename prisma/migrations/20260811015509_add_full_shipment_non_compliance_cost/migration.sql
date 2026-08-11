-- Full: custo de inconformidade (INBOUND_PENALTY/OVERAGE) por envio, somado ao custo total
ALTER TABLE "full_shipments" ADD COLUMN "non_compliance_cost" DECIMAL(18,2) NOT NULL DEFAULT 0;
