from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PlaylistViewSet

router = DefaultRouter()
router.register('playlists', PlaylistViewSet, basename='playlists')

urlpatterns = [path('', include(router.urls))]
