# Resolved foundation dependencies

Node 22.23.3, pnpm 10.32.1, Next.js 16.4.0, React 19.3.0,
TypeScript 5.9.3, Zod 4.6.5, next-intl 4.14.9, Biome 2.5.15,
Vitest 5.0.3 and Playwright 1.63.0. Exact package versions are locked in pnpm-lock.yaml.

This phase uses Node22; if your global Node is older, use a version manager or
`npm exec --package=node@22 --package=pnpm@10 -- pnpm <command>`.

Production uses no external fonts or CDN assets. Live AI requests are not part of tests.
