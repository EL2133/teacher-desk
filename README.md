# Teacher Desk／教師枱

A school-agnostic teacher work platform: timetable, calendar desk, PDF AI analysis, and related tools. Not tied to any specific school.

## Quick start

1. Copy `web/.env.example` to `web/.env` and fill in your keys (never commit `.env`).
2. On Windows, double-click `start.bat` in this folder.
3. Open http://localhost:5174

Calendar admin desk: double-click `管理台.bat`, then open http://127.0.0.1:5174/admin

## Accounts (this public copy)

Google OAuth and Brevo mail for this copy use `elaw3033@gmail.com` (not a school account). See `web/README.md` and `web/.env.example`.

## Deploy

See `web/Dockerfile`, `web/Procfile`, and `web/README.md` for Render / static + API notes.
