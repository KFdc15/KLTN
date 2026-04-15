const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

const envFile = process.env.PRISMA_ENV_FILE
	? path.resolve(projectRoot, process.env.PRISMA_ENV_FILE)
	: path.resolve(projectRoot, '.env.local');

if (!fs.existsSync(envFile)) {
	console.error(`Env file not found: ${envFile}`);
	console.error('Create .env.local or set PRISMA_ENV_FILE to a valid path.');
	process.exit(1);
}

require('dotenv').config({ path: envFile });

if (!process.env.DATABASE_URL) {
	console.error(`Missing DATABASE_URL after loading: ${envFile}`);
	process.exit(1);
}

// Use the Prisma CLI Node entrypoint for cross-platform execution.
const prismaCliEntrypoint = path.resolve(projectRoot, 'node_modules', 'prisma', 'build', 'index.js');
if (!fs.existsSync(prismaCliEntrypoint)) {
	console.error(`Prisma CLI entrypoint not found: ${prismaCliEntrypoint}`);
	console.error('Did you run npm install?');
	process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error('Usage: node scripts/prisma-local-env.js <prisma args...>');
	console.error('Example: node scripts/prisma-local-env.js db push');
	process.exit(1);
}

const result = spawnSync(process.execPath, [prismaCliEntrypoint, ...args], {
	cwd: projectRoot,
	stdio: 'inherit',
	env: process.env,
});

if (result.error) {
	console.error(result.error);
	process.exit(1);
}

process.exit(result.status ?? 1);
