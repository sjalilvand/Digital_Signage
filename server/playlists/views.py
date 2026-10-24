"""ViewSet برنامه‌های نمایش (قرارداد §3)."""
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import audit
from core.permissions import RolePermission

from .models import Playlist
from .serializers import PlaylistSerializer
from .services import replace_items


class PlaylistViewSet(viewsets.ModelViewSet):
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    write_roles = ['content_manager', 'admin']

    def get_queryset(self):
        return (
            Playlist.objects.select_related('created_by')
            .prefetch_related('items__content')
            .order_by('-updated_at')
        )

    def create(self, request, *args, **kwargs):
        items_data = request.data.get('items') if isinstance(request.data, dict) else None
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        playlist = serializer.save(created_by=request.user)
        if items_data is not None:
            replace_items(playlist, items_data)
        audit(request.user, 'playlist.create', 'playlist', str(playlist.id), {'name': playlist.name})
        out = self.get_serializer(playlist)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=201, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        playlist = serializer.save()
        if isinstance(request.data, dict) and 'items' in request.data:
            replace_items(playlist, request.data.get('items'))
        audit(request.user, 'playlist.update', 'playlist', str(playlist.id), {'name': playlist.name})
        return Response(self.get_serializer(playlist).data)

    def perform_destroy(self, instance):
        audit(self.request.user, 'playlist.delete', 'playlist', str(instance.id), {'name': instance.name})
        instance.delete()

    @action(detail=True, methods=['put'], url_path='items')
    def put_items(self, request, pk=None):
        """جایگزینی کامل آیتم‌ها (ذخیره drag&drop)."""
        playlist = self.get_object()
        data = request.data
        items = data.get('items') if isinstance(data, dict) else data
        replace_items(playlist, items)
        audit(request.user, 'playlist.items_replace', 'playlist', str(playlist.id),
              {'count': len(items) if isinstance(items, list) else 0})
        return Response(self.get_serializer(playlist).data)
