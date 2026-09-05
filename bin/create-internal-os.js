#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// Each generator release targets an immutable starter tag for reproducibility.
const TEMPLATE_REPOSITORY = "https://github.com/Cachaza/internal-os-starter.git";
const TEMPLATE_REF = "v0.2.0";
const DEFAULT_TARGET = "internal-os-app";

const HELP = `Create an Internal OS application.

Usage:
  pnpm create internal-os [directory] [options]

Options:
  --name <name>          Product name shown in the interface
  --scope <scope>        Workspace package scope, for example @acme
  --database <name>      PostgreSQL database name
  --yes                  Accept defaults and skip confirmation
  --no-install           Skip dependency installation
  --no-git               Skip Git initialization
  -h, --help             Show this help
`;

export function parseCliArgs(args) {
	const { positionals, values } = parseArgs({
		args,
		allowNegative: true,
		allowPositionals: true,
		options: {
			database: { type: "string" },
			git: { type: "boolean" },
			help: { type: "boolean", short: "h" },
			install: { type: "boolean" },
			name: { type: "string" },
			scope: { type: "string" },
			yes: { type: "boolean" },
		},
		strict: true,
	});
	if (positionals.length > 1) {
		throw new Error(`Expected one destination directory; received ${positionals.length}. Remove the extra positional arguments.`);
	}
	return {
		database: values.database,
		git: values.git,
		help: values.help ?? false,
		install: values.install,
		name: values.name,
		scope: values.scope,
		target: positionals[0],
		yes: values.yes ?? false,
	};
}

export function defaultsForTarget(target) {
	const slug = path.basename(path.resolve(target)).toLowerCase();
	const safeSlug = slug.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
	if (!safeSlug) {
		throw new Error(`Cannot derive a project name from "${target}". Use a directory containing letters or numbers.`);
	}
	return {
		database: safeSlug.replaceAll("-", "_"),
		name: safeSlug.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" "),
		scope: `@${safeSlug}`,
		slug: safeSlug,
	};
}

export function validateConfiguration(configuration) {
	if (!configuration.name.trim()) throw new Error("Product name cannot be empty. Enter a visible product name.");
	if (!/^@[a-z0-9][a-z0-9._-]*$/.test(configuration.scope)) {
		throw new Error(`Invalid package scope "${configuration.scope}". Use lowercase letters, numbers, dots, underscores, or hyphens after @, for example @acme.`);
	}
	if (!/^[a-z][a-z0-9_]*$/.test(configuration.database)) {
		throw new Error(`Invalid database name "${configuration.database}". Use lowercase letters, numbers, and underscores, beginning with a letter.`);
	}
}

export function buildGeneratedReadme(configuration) {
	return `# ${configuration.name}

An organization-aware internal application generated from [Internal OS Starter](https://github.com/Cachaza/internal-os-starter).

## Start locally

\`\`\`bash
pnpm run dev:stack
\`\`\`

Open [http://localhost:3001](http://localhost:3001), create an account, and create or select an organization.

## Architecture

- \`apps/web\`: Next.js backoffice and tRPC boundary
- \`apps/worker\`: Node.js worker for durable PostgreSQL jobs
- \`packages/api\`: application procedures
- \`packages/auth\`: Better Auth configuration
- \`packages/db\`: Drizzle schema, migrations, and jobs
- \`packages/env\`: validated environment variables
- \`packages/ui\`: shared shadcn/ui primitives

Organization-owned data must use the membership boundary exposed by \`${configuration.scope}/api\`. Long-running, delayed, and retryable effects belong in the PostgreSQL job system.

## Environment

- \`apps/web/.env\`: authentication and web database settings
- \`apps/worker/.env\`: worker database and job policy settings
- PostgreSQL database: \`${configuration.database}\`

Both files are generated from their checked-in examples. Use your deployment's secret and configuration system in production.

## Verification

\`\`\`bash
pnpm exec biome check .
pnpm run check-types
pnpm run test:integration
pnpm run build
\`\`\`

Integration tests require a migrated disposable PostgreSQL database through \`DATABASE_URL\`.
`;
}

async function run(command, args, options = {}) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", ...options });
		child.once("error", (error) => reject(new Error(`Could not run ${command}. Install it, ensure it is available in PATH, and try again.`, { cause: error })));
		child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`)));
	});
}

async function pathExists(filePath) {
	try { await stat(filePath); return true; }
	catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function replaceTemplateTokens(directory, configuration) {
	const replacements = [["@internal-os", configuration.scope], ["Internal OS", configuration.name], ["internal_os", configuration.database]];
	async function visit(currentDirectory) {
		for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
			const entryPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) { await visit(entryPath); continue; }
			if (!entry.isFile()) continue;
			const contents = await readFile(entryPath);
			if (contents.includes(0)) continue;
			const original = contents.toString("utf8");
			let updated = original;
			for (const [token, replacement] of replacements) updated = updated.replaceAll(token, replacement);
			if (updated !== original) await writeFile(entryPath, updated);
		}
	}
	await visit(directory);
	const packagePath = path.join(directory, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	packageJson.name = configuration.slug;
	await writeFile(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`);
	await writeFile(path.join(directory, "README.md"), buildGeneratedReadme(configuration));
}

async function createEnvironmentFiles(directory) {
	for (const app of ["web", "worker"]) {
		const appDirectory = path.join(directory, "apps", app);
		await cp(path.join(appDirectory, ".env.example"), path.join(appDirectory, ".env"));
	}
	const webEnvironmentPath = path.join(directory, "apps/web/.env");
	const environment = await readFile(webEnvironmentPath, "utf8");
	// Better Auth requires at least 32 characters; 32 random bytes produce a 64-character hex secret.
	await writeFile(webEnvironmentPath, environment.replace("replace-with-at-least-32-characters", randomBytes(32).toString("hex")));
}

async function askText(prompts, label, supplied, fallback) {
	if (supplied !== undefined) return supplied;
	return (await prompts.question(`${label} (${fallback}): `)).trim() || fallback;
}

async function askBoolean(prompts, label, supplied, fallback = true) {
	if (supplied !== undefined) return supplied;
	while (true) {
		const answer = (await prompts.question(`${label}? (${fallback ? "Y/n" : "y/N"}): `)).trim().toLowerCase();
		if (!answer) return fallback;
		if (["y", "yes"].includes(answer)) return true;
		if (["n", "no"].includes(answer)) return false;
		console.log(`Enter yes or no for "${label}".`);
	}
}

async function collectConfiguration(options) {
	if (!process.stdin.isTTY) {
		if (!options.target) throw new Error("Destination directory is required in non-interactive mode. Pass it after internal-os.");
		const defaults = defaultsForTarget(options.target);
		return {
			configuration: { database: options.database ?? defaults.database, name: options.name ?? defaults.name, scope: options.scope ?? defaults.scope, slug: defaults.slug },
			git: options.git ?? true,
			install: options.install ?? true,
			target: options.target,
		};
	}
	const prompts = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const target = options.target ?? (options.yes ? DEFAULT_TARGET : await askText(prompts, "Project directory", undefined, DEFAULT_TARGET));
		const defaults = defaultsForTarget(target);
		const configuration = {
			database: options.yes ? options.database ?? defaults.database : await askText(prompts, "Database name", options.database, defaults.database),
			name: options.yes ? options.name ?? defaults.name : await askText(prompts, "Product name", options.name, defaults.name),
			scope: options.yes ? options.scope ?? defaults.scope : await askText(prompts, "Package scope", options.scope, defaults.scope),
			slug: defaults.slug,
		};
		const install = options.yes ? options.install ?? true : await askBoolean(prompts, "Install dependencies", options.install);
		const git = options.yes ? options.git ?? true : await askBoolean(prompts, "Initialize Git", options.git);
		if (!options.yes) {
			console.log(`\nProject summary\n  Directory: ${target}\n  Product:   ${configuration.name}\n  Scope:     ${configuration.scope}\n  Database:  ${configuration.database}\n  Install:   ${install ? "yes" : "no"}\n  Git:       ${git ? "yes" : "no"}\n`);
			if (!(await askBoolean(prompts, "Create this project", undefined))) return null;
		}
		return { configuration, git, install, target };
	} finally { prompts.close(); }
}

export async function main(args = process.argv.slice(2)) {
	const options = parseCliArgs(args);
	if (options.help) { console.log(HELP); return; }
	const selection = await collectConfiguration(options);
	if (!selection) { console.log("Cancelled. No files were created."); return; }
	validateConfiguration(selection.configuration);
	const destination = path.resolve(selection.target);
	if (await pathExists(destination)) throw new Error(`Cannot create the project at ${destination}: the path already exists. Choose a new directory or remove it first.`);
	await mkdir(path.dirname(destination), { recursive: true });
	console.log(`\nCreating ${selection.configuration.name} in ${destination}\n`);
	const cleanup = () => {
		rmSync(destination, { force: true, recursive: true });
		console.error("\nCancelled. Removed the incomplete project.");
		// 128 + SIGINT (2) is the conventional shell status for an interrupted command.
		process.exit(130);
	};
	process.once("SIGINT", cleanup);
	process.once("SIGTERM", cleanup);
	try {
		await mkdir(destination);
		await run("git", ["init", "--quiet", destination]);
		await run("git", ["-C", destination, "fetch", "--quiet", "--depth", "1", TEMPLATE_REPOSITORY, `refs/tags/${TEMPLATE_REF}`]);
		await run("git", ["-C", destination, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
		await rm(path.join(destination, ".git"), { force: true, recursive: true });
		console.log("✓ Downloaded the starter");
		await replaceTemplateTokens(destination, selection.configuration);
		console.log("✓ Applied project settings");
		await createEnvironmentFiles(destination);
		console.log("✓ Created environment files");
		if (selection.git) { await run("git", ["init", "--quiet", "--initial-branch=main"], { cwd: destination }); console.log("✓ Initialized Git"); }
		if (selection.install) { await run("pnpm", ["install"], { cwd: destination }); console.log("✓ Installed dependencies"); }
	} catch (error) { await rm(destination, { force: true, recursive: true }); throw error; }
	finally { process.off("SIGINT", cleanup); process.off("SIGTERM", cleanup); }
	console.log(`\nProject created.\n\nNext steps:\n  cd ${selection.target}\n  pnpm run dev:stack`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => { console.error(`\nUnable to create the project. ${error.message}`); process.exitCode = 1; });
}
