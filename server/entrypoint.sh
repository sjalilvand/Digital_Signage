#!/bin/sh
set -e

MODE="${MODE:-api}"

echo ">> [entrypoint] MODE=${MODE}"

# makemigrations check (non-fatal warning: model changes without migrations)
python manage.py makemigrations --check --dry-run \
  && echo ">> [entrypoint] migrations are in sync" \
  || echo ">> [entrypoint] WARNING: model changes detected without migrations"

python manage.py migrate --noinput

if [ "${COLLECTSTATIC:-0}" = "1" ]; then
  python manage.py collectstatic --noinput
fi

if [ -n "${DJANGO_SUPERUSER_USERNAME}" ] && [ -n "${DJANGO_SUPERUSER_PASSWORD}" ]; then
  python manage.py createsuperuser --noinput \
    || echo ">> [entrypoint] superuser exists or creation failed (continuing)"
fi

case "$MODE" in
  api)
    exec daphne -b 0.0.0.0 -p 8000 config.asgi:application
    ;;
  worker)
    exec celery -A config worker -l info
    ;;
  beat)
    exec celery -A config beat -l info
    ;;
  *)
    echo ">> [entrypoint] unknown MODE='${MODE}' (expected: api | worker | beat)"
    exit 1
    ;;
esac
