"""ViewSet کاربران (فقط admin) + لاگین/رفرش JWT."""
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView

from core.audit import audit
from core.permissions import IsAdminRole

from .models import User
from .serializers import LoginSerializer, UserSerializer, UserWriteSerializer


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


class UserViewSet(viewsets.ModelViewSet):
    """GET/POST /users/ و PATCH/DELETE /users/{id}/ — فقط admin."""

    queryset = User.objects.all().order_by('id')
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return UserWriteSerializer
        return UserSerializer

    def perform_create(self, serializer):
        user = serializer.save()
        audit(self.request.user, 'user.create', 'user', user.id, {'username': user.username, 'roles': user.role_list})

    def perform_update(self, serializer):
        user = serializer.save()
        audit(self.request.user, 'user.update', 'user', user.id, {'username': user.username, 'roles': user.role_list})

    def perform_destroy(self, instance):
        audit(self.request.user, 'user.delete', 'user', instance.id, {'username': instance.username})
        instance.delete()
