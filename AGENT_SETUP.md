# "Ask the data" widget — setup runbook

What this is: a floating chat button (bottom-right, every page) that lets users ask natural-
language questions about the MIT collaboration counts (within/across/inter, works vs.
collaborations, top partners). It's grounded — the model only sees `data/agent/summary.json`
(built from the same `collab.py` numbers as the rest of the site) and is told not to guess.

Three pieces, all already written and sitting in the repo:
- `data/agent/summary.json` — the grounding data (53 KB), built by `build_agent_summary.py`.
- `worker/index.js` + `worker/wrangler.toml` — a Cloudflare Worker that holds your Anthropic API
  key server-side and proxies the chat request. **I can't create accounts or hold API keys for
  you, so this part needs you to do the four steps below once.**
- `agent_widget.js` — the chat UI, already linked into all 8 pages.

## 1. Get an Anthropic API key
1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in (or create an account).
2. Go to **API Keys** → **Create Key**. Copy it somewhere safe — you'll paste it once in step 3,
   nowhere else.

## 2. Create a free Cloudflare account + install Wrangler
1. Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) (free tier is
   plenty for this — 100k requests/day).
2. On your own machine, in a terminal:
   ```
   npm install -g wrangler
   wrangler login
   ```
   This opens a browser tab to authorize Wrangler against your new Cloudflare account.

## 3. Deploy the Worker
From your terminal, `cd` into the `worker/` folder in the repo (`C:\dev\collab-mit\worker`), then:
```
wrangler deploy
```
Then set your API key as a secret (never goes in a file, never gets committed to git):
```
wrangler secret put ANTHROPIC_API_KEY
```
It'll prompt you to paste the key from step 1 — paste it there, not anywhere else.

`wrangler deploy` prints a URL like `https://mit-collabs-agent.<your-subdomain>.workers.dev` —
copy that.

## 4. Point the widget at your Worker
Open `agent_widget.js` (repo root) and change this line near the top:
```js
const AGENT_ENDPOINT = "https://mit-collabs-agent.YOUR-SUBDOMAIN.workers.dev";
```
to the real URL from step 3. Also open `worker/index.js` and confirm `ALLOWED_ORIGIN` matches
your Pages URL (`https://academic-analytics-llc.github.io` — already set correctly, only change
this if you move the site).

## 5. Push to GitHub
```
cd C:\dev\collab-mit
git add -A
git commit -m "Add natural-language 'Ask the data' widget"
git push
```
Wait a minute or two for Pages to redeploy, then open any page — the "?" button bottom-right
should answer things like "How many within-unit works does Physics have?" or "What are EECS's
top collaboration partners?".

## Maintenance
Whenever the underlying counts change (a new SAS extract, a bug fix like the ones from this
week), rerun from the MITCollabs folder:
```
py build_agent_summary.py
```
then copy the resulting `summary.json` to `data/agent/summary.json` in the site repo and push.
The Worker always fetches the live `summary.json` from GitHub Pages (cached 5 minutes), so you
never need to redeploy the Worker itself for a data update — only for code changes to
`worker/index.js`.

## Cost / limits
- Cloudflare Workers free tier: 100,000 requests/day — far more than this will need.
- Anthropic API: pay-per-token, billed to your Anthropic account. The Worker uses
  `claude-haiku-4-5` by default (fast and inexpensive) with a 500-token cap per answer and a
  500-character cap on the question; edit `ANTHROPIC_MODEL` in `worker/index.js` to upgrade to
  Sonnet if you want stronger reasoning on harder questions.
- No rate limiting is built in yet. If this becomes public-facing at scale, Cloudflare's free
  dashboard rate-limiting rules are worth adding — flag it if you want that next.
