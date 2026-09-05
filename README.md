# create-internal-os

Create an organization-aware internal application from [Internal OS Starter](https://github.com/Cachaza/internal-os-starter).

```bash
pnpm create internal-os my-app
```

You can omit the directory and choose it interactively. The generator asks only for values not already supplied, shows a confirmation summary, creates both application environment files, and reports each completed step.

For non-interactive use:

```bash
pnpm create internal-os my-app \
  --name "My App" \
  --scope "@my-app" \
  --database my_app
```

Skip dependency installation with `--no-install`.

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
node bin/create-internal-os.js ../generated-app --no-install
```

The generator version is paired with a tagged starter release so repeated use of the same version remains reproducible.
