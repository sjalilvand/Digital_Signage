"""
تنظیمات Django — سرور دیجیتال signage (تک‌فایل، مبتنی بر متغیرهای محیطی).

منبع حقیقت: docs/API_CONTRACT.md
- دیتابیس: اگر DATABASE_URL یا POSTGRES_HOST تنظیم شده باشد PostgreSQL، وگرنه SQLite3 (برای اجرای محلی/چک).
- Redis: اگر REDIS_URL تنظیم شده باشد برای channel layer/cache، وگرنه fallback درون-حافظه‌ای.
"""
import os
from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
_env_file = os.path.join(BASE_DIR, '.env')
if os.path.isfile(_env_file):
    environ.Env.read_env(_env_file)

# ---------------------------------------------------------------------------
# امنیت پایه
# ---------------------------------------------------------------------------
SECRET_KEY = env('SECRET_KEY', default='insecure-dev-secret-change-me-in-production')
DEBUG = env.bool('DEBUG', default=True)
ALLOWED_HOSTS = [h.strip() for h in env('ALLOWED_HOSTS', default='*').split(',') if h.strip()]

# ---------------------------------------------------------------------------
# اپلیکیشن‌ها
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'channels',
    # اپ‌های پروژه
    'accounts',
    'library',
    'playlists',
    'publishing',
    'devices',
    'core',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

AUTH_USER_MODEL = 'accounts.User'

# ---------------------------------------------------------------------------
# دیتابیس — PostgreSQL فقط وقتی پیکربندی شده؛ در غیر این صورت SQLite (اجرا محلی)
# ---------------------------------------------------------------------------
DATABASE_URL = os.environ.get('DATABASE_URL', '')
POSTGRES_HOST = os.environ.get('POSTGRES_HOST', '')

# فقط URLهای PostgreSQL معتبرند؛ بقیه (مثلاً schemeهای محیط اجرا) نادیده گرفته می‌شوند
_url_is_pg = DATABASE_URL.split(':', 1)[0].lower() in ('postgres', 'postgresql')

if DATABASE_URL and _url_is_pg:
    DATABASES = {'default': env.db_url('DATABASE_URL')}
elif POSTGRES_HOST:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('POSTGRES_DB', 'signage'),
            'USER': os.environ.get('POSTGRES_USER', 'signage'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'signage'),
            'HOST': POSTGRES_HOST,
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

# ---------------------------------------------------------------------------
# Redis / Channel Layer / Cache (fallback درون-حافظه‌ای وقتی REDIS_URL خالی است)
# ---------------------------------------------------------------------------
REDIS_URL = os.environ.get('REDIS_URL', '')

if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [REDIS_URL], 'capacity': 2000},
        }
    }
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
        }
    }
else:
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
    }
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'signage',
        }
    }

# ---------------------------------------------------------------------------
# Celery (صف Redis؛ beat: mark_offline_devices هر ۳۰ ثانیه)
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL or 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = CELERY_BROKER_URL
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TIMEZONE = 'Asia/Tehran'
CELERY_BROKER_CONNECTION_MAX_RETRIES = 3
CELERY_TASK_ALWAYS_EAGER = env.bool('CELERY_TASK_ALWAYS_EAGER', default=False)
CELERY_BEAT_SCHEDULE = {
    'mark-offline-devices-every-30s': {
        'task': 'core.tasks.mark_offline_devices',
        'schedule': 30.0,
    },
}

# ---------------------------------------------------------------------------
# DRF + JWT (ACCESS 12h / REFRESH 30d — سیستم کوچک خصوصی)
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'core.auth.DeviceTokenAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'TOKEN_OBTAIN_SERIALIZER': 'accounts.serializers.LoginSerializer',
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOW_ALL_ORIGINS = DEBUG
if not DEBUG:
    _origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
    CORS_ALLOWED_ORIGINS = [o.strip() for o in _origins.split(',') if o.strip()]

# ---------------------------------------------------------------------------
# آپلود فایل (قرارداد §0: پیش‌فرض ۲GB)
# ---------------------------------------------------------------------------
MAX_UPLOAD_GB = int(os.environ.get('MAX_UPLOAD_GB', '2'))
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_GB * 1024 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# ---------------------------------------------------------------------------
# استاتیک و مدیا
# ---------------------------------------------------------------------------
STATIC_URL = '/static/'
STATIC_ROOT = env('STATIC_ROOT', default='/data/static')

_media_env = os.environ.get('MEDIA_ROOT')
if _media_env:
    MEDIA_ROOT = _media_env
elif os.path.isdir('/data'):
    MEDIA_ROOT = '/data/media'
else:
    MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'

# ---------------------------------------------------------------------------
# بین‌المللی‌سازی
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'fa'
TIME_ZONE = 'Asia/Tehran'
USE_I18N = True
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'simple'},
    },
    'root': {
        'handlers': ['console'],
        'level': os.environ.get('LOG_LEVEL', 'INFO'),
    },
}
