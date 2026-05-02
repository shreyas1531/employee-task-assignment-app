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

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO migration_admin, app_rw, app_ro;
GRANT CREATE ON SCHEMA public TO migration_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_rw;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ro;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_admin IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_admin IN SCHEMA public
GRANT SELECT ON TABLES TO app_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_admin IN SCHEMA public
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE migration_admin IN SCHEMA public
GRANT SELECT ON SEQUENCES TO app_ro;
