# create-internal-os

Create an organization-aware internal application from [Internal OS Starter](https://github.com/Cachaza/internal-os-starter).

```bash
pnpm create internal-os my-app
```

The generator asks for the product name, workspace package scope, and PostgreSQL database name. It then creates an independent Git repository, generates `apps/web/.env`, and installs dependencies.

For non-interactive use:

```bash
pnpm create internal-os my-app \
  --name "My App" \
  --scope "@my-app" \
  --database my_app
```

Skip dependency installation with `--no-install`.

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
