from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DeploymentViewSet, PublishView, PublishVersionViewSet

router = DefaultRouter()
router.register('publish-versions', PublishVersionViewSet, basename='publish-versions')
router.register('deployments', DeploymentViewSet, basename='deployments')

urlpatterns = [
    path('publish/', PublishView.as_view(), name='publish'),
    path('', include(router.urls)),
]
