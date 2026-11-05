import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), "internal-os-launcher-"));
const project = path.join(temporary, "generated-app");
const name = 'Smoke "tools" $& workspace';
async function run(command, args, cwd) {
 await new Promise((resolve, reject) => {
  const child = spawn(command, args, {cwd, stdio:"inherit"});
  child.once("error", reject);
  child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} failed with ${signal ?? code}`)));
 });
}
try {
 const {version} = JSON.parse(await readFile(path.join(repository, "package.json"), "utf8"));
 await run("npm", ["pack", "--pack-destination", temporary], repository);
 await run("npm", ["exec", "--yes", "--package", path.join(temporary, `create-internal-os-${version}.tgz`), "--", "create-internal-os", project,
  "--name", name, "--scope", "@smoke", "--database", "smoke_app", "--yes", "--no-git"], temporary);
 const {siteConfig} = await import(pathToFileURL(path.join(project, "apps/web/src/config/site.ts")).href);
 assert.equal(siteConfig.name, name);
 assert.match(await readFile(path.join(project,"packages/api/src/routers/index.ts"), "utf8"), /systemTestJob/);
 const environment = await readFile(path.join(project,"apps/web/.env"), "utf8");
 assert.ok(!environment.includes("replace-with-at-least-32-characters"));
 assert.match(environment, /localhost:5432\/smoke_app/);
 for (const args of [["exec", "biome", "check", "."], ["test"], ["run", "check-types"], ["run", "build"]]) {
  await run("pnpm", args, project);
 }
 console.log("Packed launcher generated an application that passed lint, unit tests, typechecking and production build.");
} finally {
 await rm(temporary, {recursive:true, force:true});
}
