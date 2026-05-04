\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_admin') THEN
    CREATE ROLE migration_admin LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro LOGIN;
  END IF;
END
$$;

ALTER ROLE migration_admin PASSWORD :'migration_admin_password';
ALTER ROLE app_rw PASSWORD :'app_rw_password';
ALTER ROLE app_ro PASSWORD :'app_ro_password';

REVOKE ALL ON DATABASE :"app_db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"app_db_name" TO migration_admin, app_rw, app_ro;

\connect :"app_db_name"
ALTER SCHEMA public OWNER TO migration_admin;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO migration_admin, app_rw, app_ro;
GRANT CREATE ON SCHEMA public TO migration_admin;
DO $$
DECLARE
  tbl RECORD;
  seq RECORD;
  typ RECORD;
BEGIN
  FOR tbl IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I OWNER TO migration_admin', tbl.schemaname, tbl.tablename);
  END LOOP;

  FOR seq IN
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = 'public'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO migration_admin', seq.sequence_schema, seq.sequence_name);
  END LOOP;

  FOR typ IN
    SELECT n.nspname AS schema_name, t.typname AS type_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO migration_admin', typ.schema_name, typ.type_name);
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_rw;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ro;
DO $$
BEGIN
  EXECUTE format('GRANT migration_admin TO %I', current_user);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END
$$;

SET ROLE migration_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON TABLES TO app_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT ON SEQUENCES TO app_ro;

RESET ROLE;
