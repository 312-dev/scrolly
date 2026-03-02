import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = process.env.APP_VERSION || pkg.version;

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0'
	},
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	test: {
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['tests/setup.ts'],
		testTimeout: 10_000,
		hookTimeout: 10_000,
		pool: 'forks',
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts', 'src/routes/api/**/*.ts'],
			exclude: ['**/*.test.ts', '**/tests/**', '**/__tests__/**']
		}
	}
});
