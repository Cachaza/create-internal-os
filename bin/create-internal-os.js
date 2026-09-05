#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { spawn } from "node:child_process";

// This release is paired with the starter tag so generation remains reproducible.
const TEMPLATE_REPOSITORY = "https://github.com/Cachaza/internal-os-starter.git";
const TEMPLATE_REF = "v0.1.0";

const HELP = `Create an Internal OS application.

Usage:
  pnpm create internal-os <directory> [options]

Options:
  --name <name>          Product name shown in the interface
  --scope <scope>        Workspace package scope, for example @acme
  --database <name>      PostgreSQL database name
  --no-install           Do not run pnpm install
  -h, --help             Show this help
`;

export function parseCliArgs(args) {
	const { positionals, values } = parseArgs({
		args,
		allowNegative: true,
		allowPositionals: true,
		options: {
			database: { type: "string" },
			help: { type: "boolean", short: "h" },
			install: { type: "boolean", default: true },
			name: { type: "string" },
			scope: { type: "string" },
		},
		strict: true,
	});

	if (positionals.length > 1) {
		throw new Error("Expected one destination directory.");
	}

	return {
		database: values.database,
		help: values.help ?? false,
		install: values.install ?? true,
		name: values.name,
		scope: values.scope,
		target: positionals[0],
	};
}

export function defaultsForTarget(target) {
	const slug = path.basename(path.resolve(target)).toLowerCase();
	const safeSlug = slug
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	if (!safeSlug) {
		throw new Error(`Cannot derive a project name from "${target}".`);
	}

	return {
		database: safeSlug.replaceAll("-", "_"),
		name: safeSlug
			.split("-")
			.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
			.join(" "),
		scope: `@${safeSlug}`,
		slug: safeSlug,
	};
}

export function validateConfiguration(configuration) {
	if (!configuration.name.trim()) {
		throw new Error("Product name cannot be empty.");
	}
	if (!/^@[a-z0-9][a-z0-9._-]*$/.test(configuration.scope)) {
		throw new Error(
			`Invalid package scope "${configuration.scope}". Use a value such as @acme.`,
		);
	}
	if (!/^[a-z][a-z0-9_]*$/.test(configuration.database)) {
		throw new Error(
			`Invalid database name "${configuration.database}". Use lowercase letters, numbers, and underscores, beginning with a letter.`,
		);
	}
}

async function run(command, args, options = {}) {
	await new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", ...options });
		child.once("error", (error) => {
			reject(
				new Error(
					`Could not run ${command}. Ensure it is installed and available in PATH.`,
					{ cause: error },
				),
			);
		});
		child.once("exit", (code, signal) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with ${signal ?? `code ${code}`}.`));
		});
	});
}

async function pathExists(filePath) {
	try {
		await stat(filePath);
		return true;
	} catch (error) {
		if (error?.code === "ENOENT") return false;
		throw error;
	}
}

async function replaceTemplateTokens(directory, configuration) {
	const replacements = [
		["@internal-os", configuration.scope],
		["Internal OS", configuration.name],
		["internal_os", configuration.database],
	];

	async function visit(currentDirectory) {
		for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
			const entryPath = path.join(currentDirectory, entry.name);
			if (entry.isDirectory()) {
				await visit(entryPath);
				continue;
			}
			if (!entry.isFile()) continue;

			const contents = await readFile(entryPath);
			if (contents.includes(0)) continue;

			let updated = contents.toString("utf8");
			for (const [token, replacement] of replacements) {
				updated = updated.replaceAll(token, replacement);
			}
			if (updated !== contents.toString("utf8")) {
				await writeFile(entryPath, updated);
			}
		}
	}

	await visit(directory);

	const packagePath = path.join(directory, "package.json");
	const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
	packageJson.name = configuration.slug;
	await writeFile(packagePath, `${JSON.stringify(packageJson, null, "\t")}\n`);
}

async function createEnvironmentFile(directory) {
	const examplePath = path.join(directory, "apps/web/.env.example");
	const environmentPath = path.join(directory, "apps/web/.env");
	await cp(examplePath, environmentPath);
	const environment = await readFile(environmentPath, "utf8");
	await writeFile(
		environmentPath,
		environment.replace(
			"replace-with-at-least-32-characters",
			randomBytes(32).toString("hex"),
		),
	);
}

async function askForConfiguration(options, defaults) {
	if (!process.stdin.isTTY) {
		return {
			database: options.database ?? defaults.database,
			name: options.name ?? defaults.name,
			scope: options.scope ?? defaults.scope,
			slug: defaults.slug,
		};
	}

	const prompts = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const nameAnswer = await prompts.question(
			`Product name (${defaults.name}): `,
		);
		const name = (options.name ?? nameAnswer) || defaults.name;
		const scopeAnswer = await prompts.question(
			`Package scope (${defaults.scope}): `,
		);
		const scope = (options.scope ?? scopeAnswer) || defaults.scope;
		const databaseAnswer = await prompts.question(
			`Database name (${defaults.database}): `,
		);
		const database = (options.database ?? databaseAnswer) || defaults.database;
		return { database, name, scope, slug: defaults.slug };
	} finally {
		prompts.close();
	}
}

export async function main(args = process.argv.slice(2)) {
	const options = parseCliArgs(args);
	if (options.help) {
		console.log(HELP);
		return;
	}
	if (!options.target) {
		throw new Error(`Destination directory is required.\n\n${HELP}`);
	}

	const destination = path.resolve(options.target);
	if (await pathExists(destination)) {
		throw new Error(
			`Cannot create the project at ${destination}: the path already exists. Choose a new directory or remove it first.`,
		);
	}

	const defaults = defaultsForTarget(destination);
	const configuration = await askForConfiguration(options, defaults);
	validateConfiguration(configuration);

	await mkdir(path.dirname(destination), { recursive: true });
	console.log(`Creating ${configuration.name} in ${destination}...`);

	try {
		await mkdir(destination);
		await run("git", ["init", "--quiet", destination]);
		await run("git", [
			"-C",
			destination,
			"fetch",
			"--quiet",
			"--depth",
			"1",
			TEMPLATE_REPOSITORY,
			`refs/tags/${TEMPLATE_REF}`,
		]);
		await run("git", [
			"-C",
			destination,
			"checkout",
			"--quiet",
			"--detach",
			"FETCH_HEAD",
		]);
		await rm(path.join(destination, ".git"), { force: true, recursive: true });
		await replaceTemplateTokens(destination, configuration);
		await createEnvironmentFile(destination);
		await run("git", ["init", "--initial-branch=main"], { cwd: destination });

		if (options.install) {
			await run("pnpm", ["install"], { cwd: destination });
		}
	} catch (error) {
		await rm(destination, { force: true, recursive: true });
		throw error;
	}

	console.log(`\nDone. Next steps:\n  cd ${options.target}\n  pnpm run dev:stack`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(`\nError: ${error.message}`);
		process.exitCode = 1;
	});
}
