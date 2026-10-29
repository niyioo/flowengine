FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.production

WORKDIR /app

RUN addgroup --system flowengine && adduser --system --ingroup flowengine --home /app flowengine

# Dependencies first so code changes don't invalidate this layer.
COPY requirements/base.txt requirements/production.txt ./requirements/
RUN pip install -r requirements/production.txt

COPY --chown=flowengine:flowengine . .

# Static files are collected at build time. Production settings refuse to load
# without a real SECRET_KEY, so a throwaway one is supplied for this step only.
RUN SECRET_KEY="build-only-$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
    ALLOWED_HOSTS=localhost \
    python manage.py collectstatic --noinput \
    && chown -R flowengine:flowengine /app/staticfiles

USER flowengine

EXPOSE 8000

# Answered by HealthCheckMiddleware; verifies the database connection too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health/', timeout=4).status == 200 else 1)"

CMD ["gunicorn", "config.wsgi:application", "--config", "gunicorn.conf.py"]
