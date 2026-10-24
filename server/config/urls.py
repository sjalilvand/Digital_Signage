"""URL configuration پروژه — پنل /api/v1/ و دستگاه /device-api/v1/."""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path(
        'api/v1/',
        include(
            [
                path('', include('accounts.urls')),
                path('', include('library.urls')),
                path('', include('playlists.urls')),
                path('', include('publishing.urls')),
                path('', include('devices.urls')),
                path('', include('core.urls')),
            ]
        ),
    ),
    path('device-api/v1/', include('devices.device_urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
