-- =============================================================================
-- Garde-fous financiers appliqués par la base elle-même.
-- =============================================================================

-- 1. Un paiement ne se supprime jamais (on l'annule avec un motif).
DROP TRIGGER IF EXISTS payment_no_delete ON "Payment";
CREATE TRIGGER payment_no_delete
  BEFORE DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();

DROP TRIGGER IF EXISTS allocation_no_delete ON "PaymentAllocation";
CREATE TRIGGER allocation_no_delete
  BEFORE DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();

-- 2. Un paiement confirmé est figé : seul le passage à ANNULE est permis,
--    avec un motif et l'identité de la personne qui annule.
CREATE OR REPLACE FUNCTION fati_payment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'ANNULE' THEN
    RAISE EXCEPTION 'FATI: un paiement annulé ne peut plus être modifié';
  END IF;

  IF OLD.status = 'CONFIRME' THEN
    IF NEW."amountGnf" <> OLD."amountGnf"
       OR NEW."studentId" <> OLD."studentId"
       OR NEW.method <> OLD.method
       OR NEW."receiptNumber" IS DISTINCT FROM OLD."receiptNumber"
       OR NEW."confirmedAt" IS DISTINCT FROM OLD."confirmedAt" THEN
      RAISE EXCEPTION 'FATI: un paiement confirmé ne peut pas être modifié, seulement annulé';
    END IF;
    IF NEW.status NOT IN ('CONFIRME', 'ANNULE') THEN
      RAISE EXCEPTION 'FATI: transition de statut interdite % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  IF NEW.status = 'ANNULE' AND OLD.status <> 'ANNULE' THEN
    IF NEW."cancelReason" IS NULL OR length(trim(NEW."cancelReason")) < 5
       OR NEW."cancelledById" IS NULL OR NEW."cancelledAt" IS NULL THEN
      RAISE EXCEPTION 'FATI: annulation sans motif, sans auteur ou sans date';
    END IF;
  END IF;

  IF NEW.status = 'CONFIRME' AND NEW."receiptNumber" IS NULL THEN
    RAISE EXCEPTION 'FATI: un paiement confirmé doit avoir un numéro de reçu';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS payment_guard ON "Payment";
CREATE TRIGGER payment_guard
  BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION fati_payment_guard();

-- 3. Montants toujours positifs.
ALTER TABLE "Payment"           DROP CONSTRAINT IF EXISTS payment_amount_positive;
ALTER TABLE "Payment"           ADD  CONSTRAINT payment_amount_positive CHECK ("amountGnf" > 0);
ALTER TABLE "PaymentAllocation" DROP CONSTRAINT IF EXISTS allocation_amount_positive;
ALTER TABLE "PaymentAllocation" ADD  CONSTRAINT allocation_amount_positive CHECK ("amountGnf" > 0);
ALTER TABLE "Installment"       DROP CONSTRAINT IF EXISTS installment_amounts_valid;
ALTER TABLE "Installment"       ADD  CONSTRAINT installment_amounts_valid
  CHECK ("amountGnf" >= 0 AND "paidGnf" >= 0 AND "paidGnf" <= "amountGnf");
ALTER TABLE "InvoiceLine"       DROP CONSTRAINT IF EXISTS line_amounts_valid;
ALTER TABLE "InvoiceLine"       ADD  CONSTRAINT line_amounts_valid
  CHECK ("amountGnf" >= 0 AND "discountGnf" >= 0 AND "discountGnf" <= "amountGnf");

-- 4. Attribution atomique du prochain numéro de reçu (sans trou, sans
--    doublon, même avec plusieurs caisses en parallèle).
CREATE OR REPLACE FUNCTION fati_next_receipt_number() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO "ReceiptCounter" ("tenantId", "nextNumber")
  VALUES (app_current_tenant(), 2)
  ON CONFLICT ("tenantId") DO UPDATE SET "nextNumber" = "ReceiptCounter"."nextNumber" + 1
  RETURNING "nextNumber" - 1 INTO n;
  RETURN n;
END $$;
