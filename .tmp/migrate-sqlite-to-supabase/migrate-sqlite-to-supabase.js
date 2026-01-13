"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const DB_PATH = path_1.default.join(os_1.default.homedir(), 'Library/Application Support/xhs-generator/xhs-generator.db');
// Tables to migrate in order (respecting foreign key dependencies)
const TABLES_ORDER = [
    'themes',
    'keywords',
    'competitors',
    'topics',
    'settings',
    'llm_providers',
    'prompt_profiles',
    'trend_reports',
    'assets',
    'creatives',
    'generation_tasks',
    'publish_records',
    'metrics',
    'interaction_tasks',
    'form_assist_records',
    'scheduled_jobs',
    'job_executions',
    'rate_limit_state',
];
function sqliteQuery(query) {
    try {
        const result = (0, child_process_1.execSync)(`sqlite3 -json '${DB_PATH}' "${query}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
        return result.trim() ? JSON.parse(result) : [];
    }
    catch (e) {
        console.error(`  SQLite error: ${e.message}`);
        return [];
    }
}
async function migrate() {
    console.log('🚀 Starting SQLite → Supabase migration\n');
    if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
        process.exit(1);
    }
    const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
        db: { schema: 'public' }
    });
    // Test connection first
    const { data: testData, error: testError } = await supabase.from('themes').select('id').limit(1);
    console.log('Connection test:', testError ? `Error: ${testError.message}` : 'OK');
    console.log(`📂 SQLite: ${DB_PATH}`);
    console.log(`☁️  Supabase: ${supabaseUrl}\n`);
    for (const table of TABLES_ORDER) {
        try {
            // Get all rows from SQLite using sqlite3 CLI
            const rows = sqliteQuery(`SELECT * FROM ${table}`);
            console.log(`  [DEBUG] ${table}: got ${rows.length} rows from SQLite`);
            if (rows.length === 0) {
                console.log(`⏭️  ${table}: empty or not found, skipping`);
                continue;
            }
            // Clear existing data in Supabase
            if (table === 'settings') {
                await supabase.from(table).delete().neq('key', '');
            }
            else {
                await supabase.from(table).delete().neq('id', -999999);
            }
            // Insert in batches of 100
            const batchSize = 100;
            let inserted = 0;
            for (let i = 0; i < rows.length; i += batchSize) {
                const batch = rows.slice(i, i + batchSize).map(row => {
                    const converted = { ...row };
                    const dateFields = ['published_at', 'fetched_at', 'created_at', 'updated_at', 'last_monitored_at', 'last_login_at', 'scheduled_at', 'started_at', 'finished_at', 'window_start', 'last_request_at', 'blocked_until', 'next_run_at', 'last_run_at', 'captured_at'];
                    for (const [key, value] of Object.entries(converted)) {
                        if (typeof value === 'string') {
                            // Full datetime: "2026-01-12 05:19:39" -> "2026-01-12T05:19:39Z"
                            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
                                converted[key] = value.replace(' ', 'T') + 'Z';
                            }
                            // Invalid date formats (short dates, Chinese relative dates) -> null
                            else if (dateFields.includes(key) && !/^\d{4}-\d{2}-\d{2}/.test(value)) {
                                converted[key] = null;
                            }
                        }
                    }
                    return converted;
                });
                const { error } = await supabase.from(table).upsert(batch, {
                    onConflict: table === 'settings' ? 'key' : 'id',
                    ignoreDuplicates: false
                });
                if (error) {
                    console.error(`❌ ${table}: ${error.message}`);
                    break;
                }
                inserted += batch.length;
            }
            console.log(`✅ ${table}: ${inserted} rows migrated`);
        }
        catch (err) {
            console.error(`❌ ${table}: ${err.message}`);
        }
    }
    console.log('\n✨ Migration complete!');
}
migrate().catch(console.error);
