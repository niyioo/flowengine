# Deployment & Operations

## Architecture

```
browser ──HTTPS──▶ TLS proxy (your LB / Caddy / nginx+certbot)
                        │ HTTP + X-Forwarded-Proto
                        ▼
                  web (nginx) ── serves the React SPA
                        │ /api, /admin, /static, /health
                        ▼
                  backend (Gunicorn + Django) ──▶ db (PostgreSQL 16)
```

SPA and API share one origin, so production needs no CORS. The database has no
published port.

## First deployment

1. Create the env files and fill in every value:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   python -c "import secrets; print(secrets.token_urlsafe(64))"   # SECRET_KEY
   ```
   `DB_*` must match in both files. Production refuses to start with a weak `SECRET_KEY`.
2. Build and start: `docker compose up -d --build`
   The one-shot `migrate` service applies migrations and creates the throttle
   cache table before the API starts.
3. Create the first administrator (gets the `ADMIN` role automatically):
   `docker compose exec backend python manage.py createsuperuser`
4. Put a TLS-terminating proxy in front of port 80 that sets `X-Forwarded-Proto: https`.
   If that proxy also appends `X-Forwarded-For`, set `NUM_PROXIES=2` for the backend.
5. Sign in, create user accounts (with designation and department, which appear
   on memos), then build the approval routes under **Approval routes**.

Never run `seed_demo` in production; it refuses to run without `DEBUG`.

## Go-live checklist

- [ ] `SECRET_KEY` is unique, ≥ 50 random characters, stored outside git
- [ ] `DEBUG=False`, `ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` list only your domain
- [ ] `ADMIN_URL` changed from `admin/`; `ENABLE_API_DOCS=False`
- [ ] HTTPS works end-to-end; `http://` redirects to `https://`
- [ ] `docker compose ps` shows `db`, `backend` and `web` healthy
- [ ] `curl https://<domain>/health/` returns `{"status": "ok", "db": "connected"}`
- [ ] `docker compose exec backend python manage.py check --deploy` has no security errors
- [ ] `REFERENCE_PREFIX`, `STEP_TARGET_DAYS` and other memo settings in `backend/.env` agreed with the client (the UI reads them live; restart `backend` after changing)
- [ ] Backup cron installed, and **one restore tested** on a separate machine
- [ ] Backups are copied off the server

## Backups

`scripts/backup.sh` writes a compressed, verified `pg_dump` to `backups/` and
deletes dumps older than `BACKUP_RETENTION_DAYS` (default 14).

```cron
30 2 * * * cd /opt/flowengine && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Restore (destructive, asks for confirmation): `./scripts/restore.sh backups/<file>.dump`

## Records

Memos and their history are never deleted through the app. Users are deactivated,
not deleted, so the memos they handled keep their author. Routes are retired
(hidden from new memos), not deleted. In the Django admin, memos and their
history are read-only.

If an approver leaves while a memo is waiting on them, the memo cannot move until
it is withdrawn and raised again on an updated route. Update routes when staff
change roles.

## Upgrades

```bash
./scripts/backup.sh
git pull
docker compose up -d --build        # migrate runs before the new backend starts
```

## Monitoring

- Health: `GET /health/` (200 ok / 503 database unavailable), used by Docker healthchecks
- Logs: `docker compose logs -f backend web` (rotated at 10 MB × 5 per container)
- Security events worth alerting on: repeated `429` on `/api/auth/login/`, user deactivations
