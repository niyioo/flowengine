# FlowEngine backend

Django REST API for memo routing. See the [project README](../README.md) for
features, setup and the API, and [DEPLOYMENT.md](../DEPLOYMENT.md) for production.

## Layout

| Path | |
|---|---|
| `apps/accounts/` | Users, roles, cookie-based JWT sign-in, user management |
| `apps/memos/models.py` | Routes, memos, per-memo step copies, the append-only action log |
| `apps/memos/services.py` | The memo state machine. Every change of state goes through here, in one transaction, and writes an action |
| `apps/memos/selectors.py` | Who can see which memos, the inbox, dashboard figures |
| `apps/memos/management/commands/seed_demo.py` | Demo data (DEBUG only) |
| `common/` | Shared permissions, throttles, error format, health check |
| `config/settings/` | `base`, `development`, `local_sqlite`, `production`, `test` |

## Commands

```bash
python manage.py migrate
python manage.py createcachetable          # throttle counters in production
python manage.py createsuperuser           # gets the ADMIN role automatically
python manage.py seed_demo [--reset]       # local demo data
python manage.py test apps --settings=config.settings.test   # in-memory SQLite
```
