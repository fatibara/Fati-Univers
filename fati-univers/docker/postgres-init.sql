-- Exécuté automatiquement au premier démarrage du conteneur PostgreSQL local.
\i /fati-sql/000_roles.sql
CREATE DATABASE fati OWNER fati_owner;
\connect fati
ALTER SCHEMA public OWNER TO fati_owner;
