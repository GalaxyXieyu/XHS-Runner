-- App auth tables (web UI)
-- Purpose: gate the publicly exposed web UI with simple email+password + activation code.

CREATE TABLE IF NOT EXISTS "app_users" (
  "id" serial PRIMARY KEY,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "password_salt" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "app_activation_codes" (
  "code" text PRIMARY KEY,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "used_at" timestamp with time zone,
  "used_by_user_id" integer REFERENCES "app_users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "app_sessions" (
  "token" text PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_app_sessions_user_id" ON "app_sessions"("user_id");
CREATE INDEX IF NOT EXISTS "idx_app_sessions_expires_at" ON "app_sessions"("expires_at");
