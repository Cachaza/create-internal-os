import assert from "node:assert/strict";
import test from "node:test";

import {
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
			help: false,
			install: false,
			name: "My App",
			scope: "@my-app",
			target: "my-app",
		},
	);
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
