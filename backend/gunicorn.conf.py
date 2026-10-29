"""Gunicorn settings. Every value can be overridden with an environment variable."""
import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")
workers = int(os.getenv("GUNICORN_WORKERS", min(multiprocessing.cpu_count() * 2 + 1, 9)))
threads = int(os.getenv("GUNICORN_THREADS", "2"))
worker_class = "gthread"
worker_tmp_dir = "/dev/shm"

# PDF exports of long ranges are the slowest requests; keep well above them.
timeout = int(os.getenv("GUNICORN_TIMEOUT", "90"))
graceful_timeout = 30
keepalive = 5

# Recycle workers periodically to contain slow memory growth.
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = 100

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%({x-forwarded-for}i)s "%(r)s" %(s)s %(b)s %(M)sms'

forwarded_allow_ips = "*"  # only nginx can reach this port (Docker network)
