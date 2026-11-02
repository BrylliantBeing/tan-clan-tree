# Tan Family Tree

A private family tree website. Relatives join through invite links, and admins approve every addition. Admins can also add people directly.

Built with Expo Router (web), API routes, and MySQL. The server runs on Node using the `expo-server` Express adapter.

## Set up locally

1. Install dependencies with `npm install`.
2. In hPanel, create a MySQL database. Under **Remote MySQL**, allow your own IP address. Don't use "Any Host".
3. Fill in `.env`, using `.env.example` as a guide. Use the remote MySQL hostname from hPanel as `DB_HOST`.
4. Create the tables with `npm run db:migrate`.
5. Create the first admin with `npm run db:create-admin`. If a profile with exactly that name is already in the tree, the login attaches to it.
6. Start the app with `npm start`, then press `w` to open it in a browser.

## Commands

| Command | What it does |
|---|---|
| `npm start` | Starts the development server |
| `npm run build` | Builds the production site into `dist/` |
| `npm run serve` | Runs the production build. Reads environment variables from the host, not from `.env`. |
| `npm run db:migrate` | Applies new files from `migrations/` |
| `npm run db:create-admin` | Creates an approved admin from the command line |
| `npm test` | Runs unit tests |
| `npm run test:e2e` | Checks the approval and permission rules against a running build (see below) |
| `npm run lint`, `npm run typecheck` | Lint and typecheck |

## Deploy to Hostinger

This needs a plan that includes Node.js Web Apps (Business or Cloud).

1. Create a Node.js Web App in hPanel and connect this repository.
2. Set the build command to `npm run build` and the start command to `npm run serve`.
3. Add the variables from `.env.example` in the app's environment settings, with `DB_HOST=localhost` and `APP_URL` set to your `https://` domain. `APP_URL` must match the domain exactly, because requests from any other origin are refused.
4. Run `npm run db:migrate` and `npm run db:create-admin` once, from your computer or the server.

When an update adds a file to `migrations/`, run `npm run db:migrate` before deploying the new code, because the new code expects those changes to be in the database.

## Using the tree

The app has two tabs, Tree and Profile. The tree opens centered on whoever is signed in, and can be dragged and zoomed.

- Tap a person's card to see their details.
- Tap the top edge of a card to add a parent, the bottom edge to add a child, or either side to add a spouse or sibling. The tap area reaches a little past the card (see `src/features/tree/hit-zones.ts`).
- Everyone edits their own details from the Profile tab. Admins manage other people through the link in a person's details, and review additions from the Profile tab.
- When an admin adds someone, they can enter the details themselves. That person joins the tree right away, with no invite or review. They have no login until an admin creates a login link from their Manage page.

A sibling isn't stored as its own relationship. The server saves them as another child of the same parents, so a sibling can only be added once the person has a parent in the tree.

Photos are stored in the database, in `person_photos`, and only signed-in, approved members can load them. The app crops and shrinks each photo before uploading it.

## Test the approval rules

`npm run test:e2e` signs in, creates people, and checks that the rules hold. It writes test data, so it refuses to run unless `DB_NAME` contains `test`.

1. Create an empty database with `test` in its name.
2. Put its details in `.env.test.local`, with `APP_URL=http://127.0.0.1:3000`.
3. Run `node --env-file=.env.test.local scripts/migrate.js`.
4. Run `npm run build`, then `node --env-file=.env.test.local server.js`.
5. In another terminal, run `npm run test:e2e`.

## How the code is organized

- `src/app/` holds screens, and `src/app/api/` holds the API routes.
- `src/server/` is server-only code. Import it only from `+api.ts` files, so secrets stay out of the browser bundle.
- `src/features/` holds the tree layout and view, session handling, and shared people components.
- `migrations/` holds the database schema as numbered SQL files.

Access rules are enforced in the API routes. `Stack.Protected` in the layouts only controls navigation, so every new API route needs its own `requireSession`, `requireApproved`, or `requireAdmin` check.
