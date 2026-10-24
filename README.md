# Inkwell SO · Spellcheck Pony

A **Spellcheck Only** application with a portable prompt, personal spelling preferences, a web interface, and a webhook integration for **[Spellcheck Pony](https://github.com/apps/spellcheck-pony)**.

The spellchecker corrects clear mistakes without intending to rewrite the author's meaning, links, code, voice, or formatting. The model can still make mistakes. The engine masks fragile text and rejects outputs that damage protected spans or line/list layout.

## Run locally

Requires **Node.js 20+** and an OpenAI API key. There are no npm runtime dependencies.

```sh
cp .env.example .env
# Set OPENAI_API_KEY inside .env
set -a; . ./.env; set +a
npm start
npm test
```

Open **http://127.0.0.1:3000**. `LOCAL_DEV_MODE=1` runs without GitHub sign-in **only on loopback**; never expose this mode to the internet.

The interface offers spelling convention, sensitivity, protected project words, additional spelling preferences, and GitHub reply style. Settings persist by numeric GitHub user ID in `data/users.json` (or `DATA_FILE`) and apply to both the browser and GitHub comment commands. Local development uses a separate `local` profile.

## Configure the existing GitHub App

The registration at **https://github.com/apps/spellcheck-pony** must be configured by its owner; adding application code does not change GitHub App settings or deploy an endpoint.

1. Deploy this Node.js server on a reachable **HTTPS** host. Set `HOST=0.0.0.0`, `APP_BASE_URL=https://YOUR-DOMAIN` and a private, durable `DATA_FILE`. Disable `LOCAL_DEV_MODE`. A single-process JSON store is supplied; use a database for horizontal scaling.
2. In Spellcheck Pony's GitHub App settings, configure the **user authorization callback URL** as `https://YOUR-DOMAIN/auth/callback`. Copy its **Client ID** to `GITHUB_CLIENT_ID`; set `GITHUB_CLIENT_SECRET` and a random `SESSION_SECRET` of at least 32 characters.
3. Enable webhooks with URL `https://YOUR-DOMAIN/api/github/webhook`; set a random secret and `GITHUB_WEBHOOK_SECRET` to the same value. Subscribe to **Issue comment** and **Pull request review comment** events.
4. Grant repository **Issues: Read & write** (conversation replies) and **Pull requests: Read & write** (inline review replies); use GitHub's least-privilege setting for other permissions. Set `GITHUB_APP_ID`, and the generated private key at `GITHUB_PRIVATE_KEY_PATH` (or the escaped PEM string at `GITHUB_PRIVATE_KEY`).
5. Set `OPENAI_API_KEY`. Install or update [Spellcheck Pony](https://github.com/apps/spellcheck-pony/installations/new) for your repositories. Sign in with GitHub through the deployed interface to save preferences.

**Installing an App is different from authorizing its user sign-in, configuring webhooks, or deploying its server.** This repository contains code for all the endpoints, but **the live App is not activated until those settings and credentials are supplied by its administrator.** Never commit API keys or private keys.

GitHub documentation: [GitHub App webhook quickstart](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events) and [setup URL](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url).

## Use it from GitHub

Add an issue or PR conversation comment containing:

```text
/spellcheck
Pleese reveiw my documment.
```

The app uses **the comment author's** saved preferences. If the entire comment is `/spellcheck`, it checks the issue or PR **description** instead. Inline PR review commands need text after the command. Only new, explicitly invoked, non-bot comments trigger replies; the bot does not edit anyone's original text.

Corrected text is quoted in a code fence (or a line-oriented diff, if that option is selected). Webhooks are authenticated using GitHub's SHA-256 signature and app installation tokens are limited to the event's repository. Webhooks are acknowledged before potentially slow model processing. Duplicate delivery IDs are suppressed **within the current running process only**; production clusters need a durable queue and cross-worker deduplication.

## HTTP endpoints

- `GET /healthz` — process health; **not** proof the GitHub App is installed or working.
- `GET /api/me` — signed-in GitHub user.
- `GET/POST /api/preferences` — individual vocabulary and settings.
- `POST /api/spellcheck` — input JSON `{"text":"..."}`, response `{original,corrected,changed,rejected}`.
- `POST /api/github/webhook` — signed GitHub delivery.
- `prompts/spellcheck-only.md` — portable canonical prompt, usable without a server.

Submitted text isn't saved by the service, **but it is sent to the configured model provider**. Session cookies are HttpOnly and SameSite; public login requires HTTPS. This project is an implementation starter, not a deployed service.
