import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	sonarjs.configs.recommended,
	security.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				__APP_VERSION__: 'readonly'
			}
		}
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'prefer-const': 'error',
			'no-var': 'error',
			eqeqeq: 'error',
			'max-lines': ['error', 550],
			'sonarjs/cognitive-complexity': ['warn', 15],
			'sonarjs/pseudo-random': 'off',
			'sonarjs/no-os-command-from-path': 'off',
			'sonarjs/no-nested-conditional': 'warn',
			'sonarjs/use-type-alias': 'off',
			'svelte/no-navigation-without-resolve': 'warn',
			'svelte/no-unused-svelte-ignore': 'warn',
			'svelte/require-each-key': 'warn',
			'svelte/prefer-svelte-reactivity': 'warn',
			'sonarjs/no-dead-store': 'warn',
			'sonarjs/no-unused-vars': 'warn',
			'security/detect-object-injection': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			'prefer-const': 'off'
		}
	},
	{
		files: ['**/*.test.ts', '**/*.spec.ts'],
		rules: {
			'max-lines': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'sonarjs/cognitive-complexity': 'off',
			'sonarjs/no-hardcoded-credentials': 'off',
			'sonarjs/no-clear-text-protocols': 'off'
		}
	},
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'data/',
			'docs/.vitepress/dist/',
			'vite.config.ts.timestamp-*',
			'seed-dev.mjs'
		]
	}
);
