-- =============================================================================
-- FATI UNIVERS — Isolation des établissements par Row-Level Security
-- =============================================================================
-- À exécuter APRÈS chaque `prisma migrate deploy` (script : npm run db:secure dans apps/api).
-- Le script est idempotent et couvre automatiquement toute nouvelle table
-- qui possède une colonne "tenantId" : impossible d'oublier une table.
--
-- Principe : l'API ouvre une transaction, puis fixe l'école active avec
--   SELECT set_config('app.tenant_id', '<uuid>', true);
--   SELECT set_config('app.user_id',   '<uuid>', true);
-- La base ne montre et n'accepte ensuite QUE les lignes de cette école.
-- Sans école active, aucune ligne n'est visible.
-- Seul le rôle fati_platform (super-administration) voit toutes les écoles,
-- grâce aux politiques « platform_all » limitées à ce rôle.
-- =============================================================================

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- 1. Toutes les tables d'école : isolation stricte sur "tenantId".
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenantId'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'Membership'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("tenantId" = app_current_tenant())
         WITH CHECK ("tenantId" = app_current_tenant())',
      r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS platform_all ON %I', r.table_name);
    EXECUTE format('CREATE POLICY platform_all ON %I TO fati_platform USING (true) WITH CHECK (true)', r.table_name);
  END LOOP;
END $$;

-- 2. Membership : visible pour l'école active OU pour le compte connecté
--    (nécessaire pour afficher « mes écoles » juste après la connexion).
--    L'écriture reste limitée à l'école active.
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_read ON "Membership";
DROP POLICY IF EXISTS membership_write ON "Membership";
DROP POLICY IF EXISTS membership_update ON "Membership";
DROP POLICY IF EXISTS membership_delete ON "Membership";
CREATE POLICY membership_read ON "Membership" FOR SELECT
  USING ("tenantId" = app_current_tenant() OR "userId" = app_current_user());
CREATE POLICY membership_write ON "Membership" FOR INSERT
  WITH CHECK ("tenantId" = app_current_tenant());
CREATE POLICY membership_update ON "Membership" FOR UPDATE
  USING ("tenantId" = app_current_tenant())
  WITH CHECK ("tenantId" = app_current_tenant());
CREATE POLICY membership_delete ON "Membership" FOR DELETE
  USING ("tenantId" = app_current_tenant());
DROP POLICY IF EXISTS platform_all ON "Membership";
CREATE POLICY platform_all ON "Membership" TO fati_platform USING (true) WITH CHECK (true);

-- 3. Tenant (l'établissement lui-même) : on voit son école active et les
--    écoles où l'on a un rôle ; on ne modifie que l'école active. La création
--    et la suspension d'écoles passent par le rôle plateforme (fati_platform).
ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON "Tenant";
DROP POLICY IF EXISTS tenant_update ON "Tenant";
CREATE POLICY tenant_read ON "Tenant" FOR SELECT
  USING (
    id = app_current_tenant()
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."tenantId" = "Tenant".id AND m."userId" = app_current_user() AND m."isActive"
    )
  );
CREATE POLICY tenant_update ON "Tenant" FOR UPDATE
  USING (id = app_current_tenant())
  WITH CHECK (id = app_current_tenant());
DROP POLICY IF EXISTS platform_all ON "Tenant";
CREATE POLICY platform_all ON "Tenant" TO fati_platform USING (true) WITH CHECK (true);
