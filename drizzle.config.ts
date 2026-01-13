import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    url: process.env.DATABASE_URL || `postgresql://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('https://', '').split('.')[0]}.supabase.co:6543/postgres`,
    // For local development, you might want to use a connection string directly
  },
  verbose: true,
  strict: true,
} satisfies Config;
