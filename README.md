# create-internal-os

Create an organization-aware internal application from [Internal OS Starter](https://github.com/Cachaza/internal-os-starter).

```bash
pnpm create internal-os my-app
# or
npx create-internal-os my-app
```

You can omit the directory and choose it interactively. The generator asks only for values not already supplied, shows a confirmation summary, creates both application environment files, and reports each completed step.

For non-interactive use:

```bash
pnpm create internal-os my-app \
  --name "My App" \
  --scope "@my-app" \
  --database my_app
```

Skip dependency installation with `--no-install`. The next steps then include installing dependencies and formatting the customized source with the starter's Biome configuration.

Accept all defaults without confirmation:

```bash
pnpm create internal-os my-app --yes
```

Skip Git initialization with `--no-git`. Pressing `Ctrl+C` during generation removes the incomplete destination.

## Generated stack

- Next.js and tRPC
- Better Auth organizations
- Drizzle and PostgreSQL
- Shared shadcn/ui primitives
- Durable PostgreSQL jobs and standalone Node.js worker
- pnpm, Turborepo, TypeScript, Biome, Docker, and GitHub Actions

## Development

```bash
npm test
npm run test:smoke
node bin/create-internal-os.js ../generated-app --no-install
```

The generator pins an exact reviewed starter commit, so repeated use of the same version remains reproducible. Version 0.3.0 uses [starter commit 58a51f2](https://github.com/Cachaza/internal-os-starter/commit/58a51f2f094d11e80280d1784b93d3c7bcbc6bd8), including organization selection, read-only settings, job completion feedback, safe test-database targeting, and Docker migration gating.

Environment creation delegates to the starter's non-overwriting `setup:local` script. Product names are escaped in the centralized `siteConfig` module, and dependency installation uses the template lockfile. Generation normalizes import ordering after a package-scope change using the starter's existing formatter.

## Release

Run `npm run check`, `npm pack --dry-run`, and `npm run test:smoke`. The smoke test executes the packed CLI, generates an application, checks its branding and environment files, and runs its lint, unit tests, typecheck and production build. Publish a new npm version only after the paired starter and generator changes are approved. Updating GitHub does not change an already published npm version.
