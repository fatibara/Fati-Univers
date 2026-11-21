-- =============================================================================
-- Rôles PostgreSQL (à exécuter UNE FOIS par l'administrateur de la base).
-- Remplacez les mots de passe avant d'exécuter ce fichier.
--
--  fati_owner    : propriétaire du schéma, utilisé UNIQUEMENT pour les
--                  migrations (DATABASE_URL pendant `prisma migrate deploy`).
--  fati_app      : utilisé par l'API. N'est ni superutilisateur ni BYPASSRLS :
--                  la Row-Level Security s'applique à toutes ses requêtes.
--  fati_platform : super-administration et tâches plateforme (création
--                  d'écoles, statistiques globales). Pas de BYPASSRLS : une
--                  politique dédiée (001_rls.sql) lui ouvre toutes les écoles,
--                  ce qui fonctionne aussi chez les hébergeurs (Neon,
--                  Supabase) où l'on n'est pas superutilisateur.
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_owner') THEN
    -- CREATEDB : nécessaire à `prisma migrate dev` (base fantôme) en développement.
    -- En production, retirez-le : ALTER ROLE fati_owner NOCREATEDB;
    CREATE ROLE fati_owner LOGIN CREATEDB PASSWORD 'CHANGER_MOI_owner';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_app') THEN
    CREATE ROLE fati_app LOGIN PASSWORD 'CHANGER_MOI_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fati_platform') THEN
    CREATE ROLE fati_platform LOGIN PASSWORD 'CHANGER_MOI_platform' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
