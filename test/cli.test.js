import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	buildGeneratedReadme,
	defaultsForTarget,
	parseCliArgs,
	replaceTemplateTokens,
	validateConfiguration,
} from "../bin/create-internal-os.js";

test("parses automated generation options", () => {
	assert.deepEqual(
		parseCliArgs([
			"my-app",
			"--name",
			"My App",
			"--scope",
			"@my-app",
			"--database",
			"my_app",
			"--no-install",
		]),
		{
			database: "my_app",
			git: undefined,
			help: false,
			install: false,
			name: "My App",
			scope: "@my-app",
			target: "my-app",
			yes: false,
		},
	);
});

test("supports default and no-git generation", () => {
	assert.deepEqual(parseCliArgs(["my-app", "--yes", "--no-git"]), {
		database: undefined,
		git: false,
		help: false,
		install: undefined,
		name: undefined,
		scope: undefined,
		target: "my-app",
		yes: true,
	});
});

test("writes project-specific onboarding", () => {
	const readme = buildGeneratedReadme({
		database: "my_app",
		name: "My App",
		scope: "@my-app",
		slug: "my-app",
	});
	assert.match(readme, /^# My App/m);
	assert.match(readme, /@my-app\/api/);
	assert.match(readme, /PostgreSQL database: `my_app`/);
 assert.match(readme, /TEST_DATABASE_URL/);
 assert.match(readme, /my_app_test/);
 assert.match(readme, /pnpm test/);
 assert.match(readme, /pnpm run docker:up/);
 assert.match(readme, /one-shot migration/);
 assert.match(readme, /pnpm install/);
});

test("derives safe defaults from the destination", () => {
	assert.deepEqual(defaultsForTarget("./Customer Portal"), {
		database: "customer_portal",
		name: "Customer Portal",
		scope: "@customer-portal",
		slug: "customer-portal",
	});
});

test("rejects invalid database names with corrective guidance", () => {
	assert.throws(
		() =>
			validateConfiguration({
				database: "Customer-Portal",
				name: "Customer Portal",
				scope: "@customer-portal",
			}),
		/lowercase letters, numbers, and underscores/,
	);
});


test("customizes branding as a string literal while preserving template validation", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "create-internal-os-"));
 try {
  await mkdir(path.join(root,"apps/web/src/config"),{recursive:true});
  await writeFile(path.join(root,"apps/web/src/config/site.ts"), 'export const siteConfig = {name: "Internal OS", description: "Internal tools"};\n');
  await writeFile(path.join(root,"package.json"), JSON.stringify({name:"internal-os-starter",type:"module",dependencies:{"@internal-os/api":"workspace:*"}}));
  await writeFile(path.join(root,".env.example"),"DATABASE_URL=postgresql://localhost/internal_os\n");
  const configuration = {name:'David\'s "tools" $& \\ workspace',scope:"@custom",database:"custom_app",slug:"custom-app"};
  await replaceTemplateTokens(root,configuration);
  const {siteConfig} = await import(pathToFileURL(path.join(root,"apps/web/src/config/site.ts")).href);
  assert.equal(siteConfig.name,configuration.name);
  assert.equal(siteConfig.description,"Internal tools");
  const pkg = JSON.parse(await readFile(path.join(root,"package.json"),"utf8"));
  assert.equal(pkg.name,"custom-app");
  assert.ok(pkg.dependencies["@custom/api"]);
  assert.match(await readFile(path.join(root,".env.example"),"utf8"),/localhost\/custom_app/);
 } finally {await rm(root,{recursive:true,force:true});}
});


test("runs through the executable symlink used by npm exec", async () => {
 const root = await mkdtemp(path.join(os.tmpdir(), "create-internal-os-bin-"));
 try {
  const executable = path.join(root, "create-internal-os");
  await symlink(fileURLToPath(new URL("../bin/create-internal-os.js", import.meta.url)), executable);
  const result = spawnSync(process.execPath, [executable, "--help"], {encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Usage:/);
  assert.match(result.stdout,/pnpm create internal-os/);
 } finally {await rm(root,{recursive:true,force:true});}
});
