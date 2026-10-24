"""WSGI config — (HTTP-only fallback; daphne/ASGI is the primary server)."""
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()
