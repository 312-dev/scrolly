import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { createLogger } from '$lib/server/logger';

const dataDir = resolve(process.env.DATA_DIR || 'data');
/* eslint-disable security/detect-non-literal-fs-filename */
mkdirSync(dataDir, { recursive: true });
mkdirSync(resolve(dataDir, 'videos'), { recursive: true });
mkdirSync(resolve(dataDir, 'providers'), { recursive: true });
/* eslint-enable security/detect-non-literal-fs-filename */

const log = createLogger('db');

export const sqlite = new Database(resolve(dataDir, 'scrolly.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

// Docker copies migrations to /app/migrations; dev uses src tree
const migrationsFolder = existsSync(resolve('migrations'))
	? resolve('migrations')
	: resolve('src/lib/server/db/migrations');

// Back up database before running migrations
const dbPath = resolve(dataDir, 'scrolly.db');
const backupDir = resolve(dataDir, 'backups');
/* eslint-disable security/detect-non-literal-fs-filename */
mkdirSync(backupDir, { recursive: true });

if (existsSync(dbPath)) {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const backupPath = resolve(backupDir, `scrolly-${timestamp}.db`);
	try {
		copyFileSync(dbPath, backupPath);
		log.info({ backupPath }, 'Pre-migration backup created');
	} catch (err) {
		log.warn({ err }, 'Pre-migration backup failed — continuing without backup');
	}
}
/* eslint-enable security/detect-non-literal-fs-filename */

function isAlreadyAppliedError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : '';
	return (
		msg.includes('duplicate column name') ||
		msg.includes('no such column') ||
		msg.includes('already exists')
	);
}

function execIdempotent(sql: string) {
	for (const stmt of sql.split('--> statement-breakpoint')) {
		const trimmed = stmt.trim();
		if (!trimmed) continue;
		try {
			sqlite.exec(trimmed);
		} catch (err: unknown) {
			if (isAlreadyAppliedError(err)) {
				log.warn({ statement: trimmed.slice(0, 80) }, 'Statement already applied — skipping');
			} else {
				throw err;
			}
		}
	}
}

/* eslint-disable security/detect-non-literal-fs-filename */
function recoverPendingMigrations(folder: string) {
	const journalPath = resolve(folder, 'meta/_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
		entries: { when: number; tag: string }[];
	};

	const lastRow = sqlite
		.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1')
		.get() as { created_at: number } | undefined;
	const lastAppliedAt = lastRow?.created_at ?? 0;

	for (const entry of journal.entries) {
		if (entry.when <= lastAppliedAt) continue;

		const sqlFile = readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf-8');
		const hash = createHash('sha256').update(sqlFile).digest('hex');

		execIdempotent(sqlFile);

		sqlite
			.prepare('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)')
			.run(hash, entry.when);
		log.info({ tag: entry.tag }, 'Migration recovered');
	}
}
/* eslint-enable security/detect-non-literal-fs-filename */

/* eslint-disable security/detect-non-literal-fs-filename */
function catchSkippedMigrations(folder: string) {
	const journalPath = resolve(folder, 'meta/_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
		entries: { when: number; tag: string }[];
	};

	const appliedRows = sqlite
		.prepare('SELECT created_at FROM __drizzle_migrations ORDER BY created_at')
		.all() as { created_at: number }[];
	const appliedSet = new Set(appliedRows.map((r) => r.created_at));

	let recovered = 0;
	for (const entry of journal.entries) {
		if (appliedSet.has(entry.when)) continue;

		const sqlFile = readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf-8');
		const hash = createHash('sha256').update(sqlFile).digest('hex');

		log.warn({ tag: entry.tag }, 'Found skipped migration — applying now');
		execIdempotent(sqlFile);

		sqlite
			.prepare('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)')
			.run(hash, entry.when);
		recovered++;
	}
	if (recovered > 0) {
		log.info({ count: recovered }, 'Recovered skipped migrations');
	}
}
/* eslint-enable security/detect-non-literal-fs-filename */

const startMs = Date.now();
try {
	migrate(db, { migrationsFolder });
} catch (err) {
	// If a migration file was regenerated after being applied (e.g. schema change + drizzle-kit generate),
	// the journal timestamp changes but the DB already has the schema changes from the old version.
	// Drizzle sees the new timestamp as unapplied and tries to re-run it, hitting "duplicate column" etc.
	// Recovery: run each pending statement idempotently and record the migration.
	const cause = err instanceof Error ? (err as { cause?: Error }).cause : undefined;
	const isSchemaConflict =
		cause instanceof Error &&
		'code' in cause &&
		cause.code === 'SQLITE_ERROR' &&
		isAlreadyAppliedError(cause);

	if (!isSchemaConflict) throw err;

	log.warn({ error: cause?.message }, 'Migration conflict — schema already matches, recovering');
	recoverPendingMigrations(migrationsFolder);
}

// Catch migrations silently skipped due to out-of-order journal timestamps.
// Drizzle skips entries where `when <= max(created_at)`, so a manually-created migration
// with a high timestamp can cause later migrations with lower timestamps to be skipped.
catchSkippedMigrations(migrationsFolder);

// Backfill shortcut tokens for existing groups that don't have one
import { isNull, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';

const groupsWithoutToken = db
	.select({ id: schema.groups.id })
	.from(schema.groups)
	.where(isNull(schema.groups.shortcutToken))
	.all();

for (const g of groupsWithoutToken) {
	db.update(schema.groups).set({ shortcutToken: uuid() }).where(eq(schema.groups.id, g.id)).run();
}

// Remove favorites that were auto-created by negative-only reactions (👎, ❓)
// A favorite is removed if the user has reactions on that clip but ALL are negative
const NEGATIVE_EMOJIS = ['👎', '❓'];
const negativeFavCleanup = sqlite // eslint-disable-line sonarjs/sql-queries -- static placeholders only
	.prepare(
		`DELETE FROM favorites WHERE rowid IN (
		SELECT f.rowid FROM favorites f
		INNER JOIN reactions r ON r.clip_id = f.clip_id AND r.user_id = f.user_id
		WHERE NOT EXISTS (
			SELECT 1 FROM reactions r2
			WHERE r2.clip_id = f.clip_id AND r2.user_id = f.user_id
			AND r2.emoji NOT IN (${NEGATIVE_EMOJIS.map(() => '?').join(',')})
		)
		GROUP BY f.clip_id, f.user_id
	)`
	)
	.run(...NEGATIVE_EMOJIS);
if (negativeFavCleanup.changes > 0) {
	log.info({ removed: negativeFavCleanup.changes }, 'Cleaned up negative-reaction-only favorites');
}

// Auto-create the group on first run if the database is empty
const groupCount = db.select({ id: schema.groups.id }).from(schema.groups).limit(1).all();
if (groupCount.length === 0) {
	const groupId = uuid();
	const inviteCode = crypto.randomBytes(4).toString('hex');

	db.insert(schema.groups)
		.values({
			id: groupId,
			name: process.env.GROUP_NAME || 'Scrolly',
			inviteCode,
			shortcutToken: uuid(),
			createdAt: new Date()
		})
		.run();

	const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
	const joinLink = `${appUrl}/join/${inviteCode}`;
	log.info('');
	log.info('========================================');
	log.info('  First-time setup: group created!');
	log.info(`  Join as host: ${joinLink}`);
	log.info('========================================');
	log.info('');
}

const version = process.env.APP_VERSION || 'dev';
log.info(
	{ version, startupMs: Date.now() - startMs, dbPath: resolve(dataDir, 'scrolly.db') },
	`v${version} started in ${Date.now() - startMs}ms`
);
