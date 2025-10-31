/**
 * Base tsdown configuration for Task Master monorepo
 * Provides shared configuration that can be extended by individual packages
 */
import type { UserConfig } from 'tsdown';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

/**
 * Environment helpers
 */
export const env = {
	isProduction,
	isDevelopment,
	NODE_ENV: process.env.NODE_ENV || 'development'
};

/**
 * Base tsdown configuration for all packages
 * Since everything gets bundled into root dist/ anyway, use consistent settings
 */
export const baseConfig: Partial<UserConfig> = {
	sourcemap: isDevelopment,
	format: 'esm',
	platform: 'node',
	dts: isDevelopment,
	// Advanced minification for production
	minify: isProduction
		? {
				compress: {
					drop_console: true, // Remove console.* calls
					drop_debugger: true, // Remove debugger statements
					pure_funcs: [
						'console.debug',
						'console.trace',
						'logger.debug',
						'logger.trace'
					] // Remove these function calls
				},
				mangle: {
					keep_classnames: false, // Mangle class names for smaller bundles
					keep_fnames: false // Mangle function names for smaller bundles
				}
		  }
		: false,
	// Advanced tree-shaking for production
	treeshake: isProduction
		? {
				preset: 'recommended',
				moduleSideEffects: false // Assume no side effects in modules
		  }
		: false,
	// Production-specific optimizations
	...(isProduction && {
		target: 'node18', // Target Node.js 18+ for optimal performance
		splitting: true, // Enable code splitting for better caching
		clean: true // Clean output directory before build
	}),
	// Better debugging in development
	...(isDevelopment && {
		keepNames: true,
		splitting: false // Disable code splitting for better stack traces
	}),
	// Keep all npm dependencies external (available via node_modules)
	external: [/^[^@./]/, /^@(?!tm\/)/]
};

/**
 * Utility function to merge configurations
 * Simplified for tsdown usage
 */
export function mergeConfig(
	base: Partial<UserConfig>,
	overrides: Partial<UserConfig>
): UserConfig {
	return {
		...base,
		...overrides
	} as UserConfig;
}

/**
 * Create a banner for CLI executables (shebang)
 * Use this for packages that produce CLI binaries
 */
export function createCliBanner(): string {
	return '#!/usr/bin/env node';
}

/**
 * Configuration preset for CLI packages
 * Includes shebang banner for executable output
 */
export function createCliConfig(
	overrides: Partial<UserConfig> = {}
): UserConfig {
	return mergeConfig(baseConfig, {
		banner: {
			js: createCliBanner()
		},
		...overrides
	});
}
