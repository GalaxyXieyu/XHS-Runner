import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL not set');
}

async function main() {
  const sql = postgres(DATABASE_URL);

  try {
    console.log('Starting migration: Convert is_enabled columns to boolean...\n');

    // 1. Fix scheduled_jobs.is_enabled
    console.log('1. Fixing scheduled_jobs.is_enabled...');
    await sql`ALTER TABLE scheduled_jobs ALTER COLUMN is_enabled DROP DEFAULT`;
    await sql`
      ALTER TABLE scheduled_jobs
      ALTER COLUMN is_enabled TYPE boolean
      USING CASE WHEN is_enabled = 1 THEN true ELSE false END
    `;
    await sql`ALTER TABLE scheduled_jobs ALTER COLUMN is_enabled SET DEFAULT true`;
    console.log('✓ scheduled_jobs.is_enabled fixed');

    // 2. Fix llm_providers.is_enabled
    console.log('2. Fixing llm_providers.is_enabled...');
    await sql`ALTER TABLE llm_providers ALTER COLUMN is_enabled DROP DEFAULT`;
    await sql`
      ALTER TABLE llm_providers
      ALTER COLUMN is_enabled TYPE boolean
      USING CASE WHEN is_enabled = 1 THEN true ELSE false END
    `;
    await sql`ALTER TABLE llm_providers ALTER COLUMN is_enabled SET DEFAULT true`;
    console.log('✓ llm_providers.is_enabled fixed');

    // 3. Fix llm_providers.is_default
    console.log('3. Fixing llm_providers.is_default...');
    await sql`ALTER TABLE llm_providers ALTER COLUMN is_default DROP DEFAULT`;
    await sql`
      ALTER TABLE llm_providers
      ALTER COLUMN is_default TYPE boolean
      USING CASE WHEN is_default = 1 THEN true ELSE false END
    `;
    await sql`ALTER TABLE llm_providers ALTER COLUMN is_default SET DEFAULT false`;
    console.log('✓ llm_providers.is_default fixed');

    console.log('\n✅ Migration completed successfully!');

    // Verify the changes
    console.log('\nVerifying changes...\n');
    const scheduledJobsColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'scheduled_jobs' AND column_name = 'is_enabled'
    `;
    console.table(scheduledJobsColumns);

    const llmProvidersColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'llm_providers' AND column_name IN ('is_enabled', 'is_default')
    `;
    console.table(llmProvidersColumns);

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

main().catch(console.error);
