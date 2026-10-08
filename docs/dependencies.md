# Pinned dependencies

| Layer | Version | Notes |
| --- | --- | --- |
| Node |22.23.3 local/container;22.x Vercel|`engines >=22.18 <23`|
| pnpm |10.32.1|Frozen lockfile; container Corepack activation|
| Next.js / React |16.4.0 /19.3.0|Standalone runtime, Node Route Handlers|
| TypeScript |5.9.3|Strict CLI checks; LSP not installed|
| Prisma / adapter-pg |7.10.0|Generate on build; preserve SQL-owned invariants|
| PostgreSQL |17|Local/test Compose uses17-alpine|
| pg |8.23.1|Known concurrency deprecation advisory remains|
| Zod |4.6.5|Boundary parsing; copied runtime startup dependency in Dockerfile|
| next-intl |4.14.9|UI also uses bilingual component labels/catalogs|
| Vitest / Playwright |5.0.3 /1.63.0|Real DB, built-app Chrome, mock AI only|
| axe / Biome |4.13.0 /2.5.15|Tagged accessibility scans and lint/format|

The lockfile is authoritative for transitive versions. Review release notes and update
all version literals, including `.node-version`/Dockerfile, when upgrading. Do not
hand-edit the lockfile or introduce dependencies solely to silence a failing test.

If global Node is older, use a version manager or
`npm exec --package=node@22 --package=pnpm@10 -- pnpm <command>`.
Production uses no external fonts or CDN assets. Live AI requests are not part of tests.
