# Sentiero

An AI study/document companion that turns overwhelming documents — worksheets, exam papers, forms, briefs, letters — into calm, paced HTML guides you can actually work through.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + inline styles for the strict visual spec
- Vercel Postgres (`@vercel/postgres`) for guide persistence
- Anthropic SDK calling Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- `pdf-parse` and `mammoth` for PDF / Word extraction
- Image uploads sent to Claude as native image blocks

## Local development

```bash
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY and POSTGRES_* vars
npm run dev
```

The first request to `/api/generate` will create the `guides` table automatically. You can also run the migration manually:

```bash
npm run migrate
```

## Environment variables

| Variable | Notes |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. |
| `POSTGRES_URL` and friends | Auto-injected by Vercel Postgres. |

## Deploy

Push to the branch and connect the repo to Vercel. Add the env vars in the Vercel project settings. The schema bootstraps itself on first API call.

## Repo layout

```
app/                 App Router pages and API routes
  page.tsx           Home (upload form)
  guide/[id]/        Guide viewer (iframe)
  api/generate/      POST: extract text → call Claude → store guide
  api/guide/[id]/    GET: load guide
components/          UI components
lib/
  db.ts              Postgres connection + queries + migration
  extract.ts         PDF / Word / image / text extraction
  system-prompt.ts   SYSTEM_PROMPT + buildUserMessage()
  title.ts           Pull a title out of generated HTML
scripts/migrate.ts   Standalone migration runner
```
