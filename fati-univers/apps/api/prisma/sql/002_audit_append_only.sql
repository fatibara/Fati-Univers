-- =============================================================================
-- Journal d'audit en AJOUT SEUL : aucune ligne ne peut être modifiée ou
-- supprimée, même par un bug de l'application.
-- =============================================================================

CREATE OR REPLACE FUNCTION fati_forbid_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'FATI: la table % est en ajout seul (% interdit)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

DROP TRIGGER IF EXISTS audit_append_only ON "AuditLog";
CREATE TRIGGER audit_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION fati_forbid_change();
