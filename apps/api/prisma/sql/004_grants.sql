-- =============================================================================
-- Droits des rôles applicatifs (idempotent, à relancer après chaque migration).
-- =============================================================================

GRANT USAGE ON SCHEMA public TO fati_app, fati_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fati_app, fati_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fati_app, fati_platform;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO fati_app, fati_platform;

-- Le journal d'audit : lecture et ajout seulement.
REVOKE UPDATE, DELETE ON "AuditLog" FROM fati_app, fati_platform;

-- Les formules commerciales sont gérées par la plateforme uniquement.
REVOKE INSERT, UPDATE, DELETE ON "Plan" FROM fati_app;
-- Les écoles sont créées et supprimées par la plateforme uniquement.
REVOKE INSERT, DELETE ON "Tenant" FROM fati_app;
