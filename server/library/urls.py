from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ContentViewSet

router = DefaultRouter()
router.register('contents', ContentViewSet, basename='contents')

urlpatterns = [path('', include(router.urls))]
