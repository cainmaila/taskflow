# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@1.1.1 create --template minimal --types ts --add prettier eslint vitest="usages:unit,component" playwright="demo:yes" tailwindcss="plugins:typography,forms" enhanced-img ai-tools="ide:claude-code+delivery:plugin" better-auth="demo:password" drizzle="database:d1" --install pnpm Taskflow
```

## Adding features

Add features to your project with `sv add`:

```sh
npx sv add
```

For example, to add Tailwind CSS:

```sh
npx sv add tailwindcss
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Deploying (Cloudflare Workers + D1)

Production: https://taskflow.cainmaila.workers.dev (see `docs/decisions.md` D72).

```sh
pnpm exec wrangler d1 create taskflow        # self-hosting: put the new database_id in wrangler.jsonc
pnpm db:migrate:remote
openssl rand -base64 32 | pnpm exec wrangler secret put BETTER_AUTH_SECRET
# set ORIGIN in wrangler.jsonc `vars`
ORIGIN=x BETTER_AUTH_SECRET=x pnpm build     # build only validates that the vars exist
pnpm exec wrangler deploy
# .env: ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME, then:
pnpm seed --remote                           # creates the first system_admin; refuses if a user exists
```
