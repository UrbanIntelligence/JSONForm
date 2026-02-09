# JSON Form API (Cloudflare Workers + D1)

This backend accepts form submissions and stores them in a D1 database. It exposes:
- `GET /entries` to fetch recent entries
- `POST /entries` to add a new entry
- `DELETE /entries/:id` to remove an entry by id

## Prereqs
- Cloudflare account
- `wrangler` CLI installed (`npm i -g wrangler`)

## Setup
1. Authenticate:
   - `wrangler login`
2. Create the database:
   - `wrangler d1 create json-form`
3. Copy the `database_id` into `wrangler.toml` (replace `YOUR_DATABASE_ID`).
4. Run migrations:
   - `wrangler d1 execute json-form --file=./schema.sql`
5. Deploy:
   - `wrangler deploy`

## Frontend wiring
After deploy, Cloudflare will print a worker URL like:
`https://json-form-api.<your-subdomain>.workers.dev`

Paste that into:
- `/Users/yli15/Documents/CodexProj/JSONForm/index.html` (the `API_BASE` constant).

## Notes
- This API is public and unauthenticated. Anyone can submit or read entries.
- The `GET /entries` endpoint returns the 500 most recent rows.
- Basic rate limiting is enabled: max 5 submissions per minute per IP.
