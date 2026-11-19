-- =============================================================================
-- Tests de sécurité de la base FATI UNIVERS (exécutés par scripts/test-db.sh)
-- Chaque bloc échoue bruyamment (RAISE EXCEPTION) si une garantie est violée.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1

-- ---------------------------------------------------------------------------
-- Données de test (en superutilisateur : la RLS ne s'applique pas ici)
-- ---------------------------------------------------------------------------
INSERT INTO "Tenant"(id, slug, name, "shortName", status, "updatedAt") VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', 'ecole-a', 'École A', 'ECOLE A', 'ACTIF', now()),
 ('bbbbbbbb-0000-0000-0000-000000000002', 'ecole-b', 'École B', 'ECOLE B', 'ACTIF', now());

INSERT INTO "User"(id, phone, "firstName", "lastName", "updatedAt") VALUES
 ('11111111-0000-0000-0000-000000000001', '+224620000001', 'Directeur', 'A', now()),
 ('22222222-0000-0000-0000-000000000002', '+224620000002', 'Directrice', 'B', now()),
 ('33333333-0000-0000-0000-000000000003', '+224620000003', 'Parent', 'DeuxEcoles', now());

INSERT INTO "Membership"(id, "tenantId", "userId", roles, "updatedAt") VALUES
 (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '{DIRECTEUR}', now()),
 (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '{DIRECTEUR}', now()),
 (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-0000-0000-0000-000000000003', '{PARENT}', now()),
 (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000003', '{PARENT}', now());

INSERT INTO "Student"(id, "tenantId", matricule, "firstName", "lastName", gender, "updatedAt") VALUES
 ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-001', 'Aïssatou', 'Diallo', 'F', now()),
 ('a0000000-0000-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'A-002', 'Mamadou', 'Barry', 'M', now()),
 ('b0000000-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000002', 'B-001', 'Fatoumata', 'Camara', 'F', now());

INSERT INTO "AcademicYear"(id, "tenantId", label, "startsOn", "endsOn") VALUES
 ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2027-2028', '2027-10-01', '2028-06-30');
INSERT INTO "Term"(id, "tenantId", "academicYearId", name, position, "startsOn", "endsOn") VALUES
 ('a2000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '1er trimestre', 1, '2027-10-01', '2027-12-20');
INSERT INTO "Level"(id, "tenantId", cycle, name, position) VALUES
 ('a3000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'COLLEGE', '10e année', 10);
INSERT INTO "Classroom"(id, "tenantId", "academicYearId", "levelId", name) VALUES
 ('a4000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', '10e A');
INSERT INTO "Subject"(id, "tenantId", code, name) VALUES
 ('a5000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'MATH', 'Mathématiques');
INSERT INTO "StaffMember"(id, "tenantId", "firstName", "lastName") VALUES
 ('a6000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ibrahima', 'Sow');
INSERT INTO "Assessment"(id, "tenantId", "classroomId", "subjectId", "termId", "createdById", type, title, date) VALUES
 ('a7000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001',
  'DEVOIR', 'Devoir 1', '2027-10-15');

INSERT INTO "AuditLog"("tenantId", action, entity) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', 'TEST', 'Test');

-- ---------------------------------------------------------------------------
-- T1. Toutes les tables qui ont "tenantId" ont la RLS ACTIVÉE et FORCÉE.
-- ---------------------------------------------------------------------------
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenantId' AND NOT a.attisdropped)
         OR c.relname = 'Tenant')
    AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'T1 ÉCHEC : tables sans RLS forcée : %', missing;
  END IF;
  RAISE NOTICE 'T1 OK  toutes les tables d''école ont la RLS activée et forcée';
END $$;

-- ---------------------------------------------------------------------------
-- Passage au rôle de l'application : la RLS s'applique désormais.
-- ---------------------------------------------------------------------------
SET ROLE fati_app;

-- T2. Sans école active : aucune donnée visible.
DO $$
BEGIN
  IF (SELECT count(*) FROM "Student") <> 0 THEN
    RAISE EXCEPTION 'T2 ÉCHEC : des élèves sont visibles sans école active';
  END IF;
  RAISE NOTICE 'T2 OK  sans école active, 0 élève visible';
END $$;

-- T3. École A active : seulement les élèves de A, même en ciblant l'id de B.
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true) AS _ \gset
DO $$
BEGIN
  IF (SELECT count(*) FROM "Student") <> 2 THEN
    RAISE EXCEPTION 'T3 ÉCHEC : l''école A devrait voir exactement 2 élèves';
  END IF;
  IF EXISTS (SELECT 1 FROM "Student" WHERE id = 'b0000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'T3 ÉCHEC : l''école A lit un élève de B par son identifiant';
  END IF;
  RAISE NOTICE 'T3 OK  l''école A ne voit que ses 2 élèves, l''élève de B est invisible même par id';
END $$;

-- T4. Modifier ou supprimer un élève de B depuis A : 0 ligne touchée.
DO $$
DECLARE n int;
BEGIN
  UPDATE "Student" SET "lastName" = 'PIRATE' WHERE id = 'b0000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'T4 ÉCHEC : A a modifié un élève de B'; END IF;
  DELETE FROM "Student" WHERE id = 'b0000000-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'T4 ÉCHEC : A a supprimé un élève de B'; END IF;
  RAISE NOTICE 'T4 OK  modification et suppression d''un élève de B depuis A : 0 ligne';
END $$;

-- T5. Créer une ligne au nom de B depuis A : refusé par la base.
DO $$
BEGIN
  BEGIN
    INSERT INTO "Student"("tenantId", matricule, "firstName", "lastName", gender, "updatedAt")
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002', 'X-1', 'Faux', 'Eleve', 'M', now());
    RAISE EXCEPTION 'T5 ÉCHEC : A a créé un élève dans B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T5 OK  création d''un élève au nom de B refusée (RLS WITH CHECK)';
  END;
END $$;

-- T6. Déplacer un élève de A vers B (changer son tenantId) : refusé.
DO $$
BEGIN
  BEGIN
    UPDATE "Student" SET "tenantId" = 'bbbbbbbb-0000-0000-0000-000000000002'
    WHERE id = 'a0000000-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'T6 ÉCHEC : un élève a été transféré vers B en changeant tenantId';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T6 OK  changement de tenantId vers une autre école refusé';
  END;
END $$;

-- T7. Une note de A qui pointe vers un élève de B : refusée par la clé
--     étrangère composite (tenantId, studentId).
DO $$
BEGIN
  BEGIN
    INSERT INTO "Grade"("tenantId", "assessmentId", "studentId", score, "updatedAt")
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-00000000000a', 15, now());
    RAISE EXCEPTION 'T7 ÉCHEC : une note de A référence un élève de B';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'T7 OK  note de A vers un élève de B refusée (clé étrangère composite)';
  END;
END $$;

-- T8. Note normale dans A : acceptée.
INSERT INTO "Grade"("tenantId", "assessmentId", "studentId", score, "updatedAt")
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-00000000000a', 15.5, now());
DO $$ BEGIN RAISE NOTICE 'T8 OK  note légitime enregistrée dans A'; END $$;

-- T9. Le journal d'audit ne peut être ni modifié ni effacé.
DO $$
BEGIN
  BEGIN
    UPDATE "AuditLog" SET action = 'EFFACE';
    RAISE EXCEPTION 'T9 ÉCHEC : AuditLog modifiable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T9 OK  journal d''audit non modifiable';
  END;
END $$;

-- T10. Paiements : numérotation des reçus continue, puis paiement figé.
DO $$
DECLARE n1 int; n2 int;
BEGIN
  n1 := fati_next_receipt_number();
  n2 := fati_next_receipt_number();
  IF n1 <> 1 OR n2 <> 2 THEN
    RAISE EXCEPTION 'T10 ÉCHEC : numéros de reçu % et % (attendu 1 et 2)', n1, n2;
  END IF;
  INSERT INTO "Payment"(id, "tenantId", "receiptNumber", "studentId", method, status, "amountGnf",
                        "idempotencyKey", "confirmedAt")
  VALUES ('a8000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', n1,
          'a0000000-0000-0000-0000-00000000000a', 'ESPECES', 'CONFIRME', 500000, 'cle-1', now());
  RAISE NOTICE 'T10 OK  reçus numérotés 1 puis 2, paiement de 500 000 GNF confirmé';
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE "Payment" SET "amountGnf" = 50000 WHERE id = 'a8000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'T11 ÉCHEC : montant d''un paiement confirmé modifié';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'T11%' THEN RAISE; END IF;
    RAISE NOTICE 'T11 OK  montant d''un paiement confirmé non modifiable';
  END;
  BEGIN
    DELETE FROM "Payment" WHERE id = 'a8000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'T12 ÉCHEC : paiement supprimé';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T12 OK  suppression d''un paiement interdite';
  END;
  BEGIN
    UPDATE "Payment" SET status = 'ANNULE' WHERE id = 'a8000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'T13 ÉCHEC : annulation sans motif acceptée';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'T13%' THEN RAISE; END IF;
    RAISE NOTICE 'T13 OK  annulation sans motif refusée';
  END;
  UPDATE "Payment"
     SET status = 'ANNULE', "cancelReason" = 'Erreur de saisie du montant',
         "cancelledById" = '11111111-0000-0000-0000-000000000001', "cancelledAt" = now()
   WHERE id = 'a8000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'T14 OK  annulation motivée acceptée';
END $$;
COMMIT;

-- T15. Parent présent dans deux écoles : sans école active, il voit ses
--      deux adhésions (pour choisir), mais aucun élève.
BEGIN;
SELECT set_config('app.user_id', '33333333-0000-0000-0000-000000000003', true) AS _ \gset
DO $$
BEGIN
  IF (SELECT count(*) FROM "Membership") <> 2 THEN
    RAISE EXCEPTION 'T15 ÉCHEC : le parent devrait voir ses 2 adhésions';
  END IF;
  IF (SELECT count(*) FROM "Tenant") <> 2 THEN
    RAISE EXCEPTION 'T15 ÉCHEC : le parent devrait voir ses 2 écoles';
  END IF;
  IF (SELECT count(*) FROM "Student") <> 0 THEN
    RAISE EXCEPTION 'T15 ÉCHEC : des élèves visibles sans école active';
  END IF;
  RAISE NOTICE 'T15 OK  un seul compte parent voit ses 2 écoles, aucune donnée scolaire sans école active';
END $$;
COMMIT;

-- T16. Le directeur de A ne voit pas les adhésions de B.
BEGIN;
SELECT set_config('app.tenant_id', 'aaaaaaaa-0000-0000-0000-000000000001', true) AS _ \gset
SELECT set_config('app.user_id', '11111111-0000-0000-0000-000000000001', true) AS _ \gset
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Membership" WHERE "tenantId" = 'bbbbbbbb-0000-0000-0000-000000000002') THEN
    RAISE EXCEPTION 'T16 ÉCHEC : A voit des comptes de B';
  END IF;
  IF (SELECT count(*) FROM "Tenant") <> 1 THEN
    RAISE EXCEPTION 'T16 ÉCHEC : A voit une autre école';
  END IF;
  RAISE NOTICE 'T16 OK  le directeur de A ne voit ni les comptes ni la fiche de l''école B';
END $$;
COMMIT;

-- T17. Le réglage d'école est local à la transaction (pas de fuite entre
--      requêtes qui partagent une connexion du pool).
DO $$
BEGIN
  IF app_current_tenant() IS NOT NULL THEN
    RAISE EXCEPTION 'T17 ÉCHEC : l''école active a survécu à la transaction';
  END IF;
  RAISE NOTICE 'T17 OK  l''école active disparaît à la fin de la transaction';
END $$;

RESET ROLE;

-- T18. Le rôle plateforme (super-administration) voit toutes les écoles et
--      peut en créer une, sans aucun privilège BYPASSRLS.
SET ROLE fati_platform;
DO $$
BEGIN
  IF (SELECT count(*) FROM "Student") < 3 THEN
    RAISE EXCEPTION 'T18 ÉCHEC : le rôle plateforme ne voit pas toutes les écoles';
  END IF;
  INSERT INTO "Tenant"(id, slug, name, "shortName", "updatedAt")
  VALUES ('cccccccc-0000-0000-0000-000000000003', 'ecole-c', 'École C', 'ECOLE C', now());
  RAISE NOTICE 'T18 OK  le rôle plateforme voit toutes les écoles et peut en créer une';
END $$;
RESET ROLE;

-- T19. Le rôle de l'application ne peut toujours pas créer d'école.
SET ROLE fati_app;
DO $$
BEGIN
  BEGIN
    INSERT INTO "Tenant"(id, slug, name, "shortName", "updatedAt")
    VALUES (gen_random_uuid(), 'ecole-pirate', 'Pirate', 'PIRATE', now());
    RAISE EXCEPTION 'T19 ÉCHEC : l''application a créé une école';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T19 OK  l''application ne peut pas créer d''école';
  END;
END $$;
RESET ROLE;
\echo 'TOUS LES TESTS DE SÉCURITÉ DE LA BASE SONT PASSÉS'
