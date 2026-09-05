import assert from "node:assert/strict";
import test from "node:test";

import {
	buildGeneratedReadme,
	defaultsForTarget,
	parseCliArgs,
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
