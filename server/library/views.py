"""ViewSet کتابخانه محتوا (قرارداد §3): فیلترها، replace/usage/assets/download، حذف ایمن."""
import json
from pathlib import Path

from django.http import FileResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import audit
from core.exceptions import Conflict
from core.files import serve_ranged
from core.models import Setting
from core.permissions import RolePermission
from playlists.models import Playlist, PlaylistItem
from publishing.models import Deployment

from .models import CONTENT_TYPES, STATUS_UPLOADED, Content, RenderedAsset, Tag
from .serializers import ContentSerializer, ContentWriteSerializer, RenderedAssetSerializer

# وضعیت‌های پایانی انتشار
TERMINAL_DEPLOYMENT_STATUSES = ['cancelled', 'replaced']
NON_TERMINAL_DEPLOYMENT_STATUSES = ['pending_connection', 'downloading', 'ready', 'active', 'playing']


class ContentViewSet(viewsets.ModelViewSet):
    serializer_class = ContentSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    write_roles = ['content_manager', 'admin']

    def get_queryset(self):
        qs = (
            Content.objects.select_related('uploaded_by', 'superseded_by')
            .prefetch_related('tags')
            .order_by('-created_at')
        )
        qp = self.request.query_params
        if qp.get('type'):
            qs = qs.filter(type=qp['type'])
        if qp.get('status'):
            qs = qs.filter(status=qp['status'])
        if qp.get('search'):
            qs = qs.filter(name__icontains=qp['search'])
        if qp.get('tag'):
            qs = qs.filter(tags__name=qp['tag']).distinct()
        return qs

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _collect_tag_names(raw):
        names = []

        def _collect(value):
            if value is None:
                return
            if isinstance(value, str):
                s = value.strip()
                if s.startswith('['):
                    try:
                        arr = json.loads(s)
                    except json.JSONDecodeError:
                        arr = None
                    if isinstance(arr, list):
                        for item in arr:
                            _collect(item)
                        return
                for part in s.split(','):
                    part = part.strip()
                    if part:
                        names.append(part)
            elif isinstance(value, (list, tuple)):
                for item in value:
                    _collect(item)

        _collect(raw)
        return list(dict.fromkeys(names))[:50]

    def _check_upload_size(self, request):
        setting = Setting.get_solo()
        content_length = request.META.get('CONTENT_LENGTH')
        try:
            if content_length and int(content_length) > setting.max_upload_gb * (1024 ** 3) + (1024 * 1024):
                return Response({'detail': 'حجم فایل بیش از حد مجاز است'}, status=413)
        except (TypeError, ValueError):
            pass
        return None

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------
    def create(self, request, *args, **kwargs):
        too_big = self._check_upload_size(request)
        if too_big:
            return too_big

        ctype = request.data.get('type')
        if ctype not in CONTENT_TYPES:
            return Response({'detail': 'نوع محتوا نامعتبر است'}, status=400)

        upload = request.FILES.get('file')
        if ctype != 'text' and upload is None:
            return Response({'detail': 'فایل محتوا الزامی است'}, status=400)

        name = request.data.get('name') or (Path(upload.name).stem if upload else 'بدون عنوان')

        text_data = request.data.get('text_data')
        if isinstance(text_data, str) and text_data.strip():
            try:
                text_data = json.loads(text_data)
            except json.JSONDecodeError:
                return Response({'detail': 'text_data باید JSON معتبر باشد'}, status=400)

        payload = {
            'name': name,
            'type': ctype,
            'description': request.data.get('description') or '',
            'original_file': upload,
            'expiry_date': request.data.get('expiry_date') or None,
            'html_entry': request.data.get('html_entry') or None,
            'text_data': text_data if ctype == 'text' else None,
        }
        serializer = ContentWriteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        content = serializer.save(
            uploaded_by=request.user,
            status=STATUS_UPLOADED,
            size_bytes=(upload.size if upload else None),
        )
        for tag_name in self._collect_tag_names(
            request.data.getlist('tags') if hasattr(request.data, 'getlist') else request.data.get('tags')
        ):
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            content.tags.add(tag)

        audit(request.user, 'content.create', 'content', str(content.id),
              {'name': content.name, 'type': content.type})
        out = self.get_serializer(content)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=201, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if 'text_data' in data and isinstance(data['text_data'], str) and data['text_data'].strip():
            try:
                data['text_data'] = json.loads(data['text_data'])
            except json.JSONDecodeError:
                return Response({'detail': 'text_data باید JSON معتبر باشد'}, status=400)
        serializer = ContentWriteSerializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        content = serializer.save()
        if 'tags' in data:
            content.tags.clear()
            for tag_name in self._collect_tag_names(data.get('tags')):
                tag, _ = Tag.objects.get_or_create(name=tag_name)
                content.tags.add(tag)
        audit(request.user, 'content.update', 'content', str(content.id), {'name': content.name})
        return Response(self.get_serializer(content).data)

    def perform_destroy(self, instance):
        playlist_ids = list(PlaylistItem.objects.filter(content=instance).values_list('playlist_id', flat=True))
        in_use = (
            Deployment.objects.filter(
                version__playlist_id__in=playlist_ids,
                status__in=NON_TERMINAL_DEPLOYMENT_STATUSES,
            ).exists()
            if playlist_ids
            else False
        )
        if in_use:
            raise Conflict('محتوا در برنامه نمایش فعال استفاده شده است')

        for asset in instance.assets.all():
            asset.file.delete(save=False)
        instance.thumbnail.delete(save=False)
        instance.original_file.delete(save=False)
        audit(self.request.user, 'content.delete', 'content', str(instance.id), {'name': instance.name})
        instance.delete()

    # ------------------------------------------------------------------
    # actions (قرارداد §3)
    # ------------------------------------------------------------------
    @action(detail=True, methods=['post'])
    def replace(self, request, pk=None):
        """فایل جدید → Content جدید + superseded_by."""
        old = self.get_object()
        too_big = self._check_upload_size(request)
        if too_big:
            return too_big
        upload = request.FILES.get('file')
        if upload is None:
            return Response({'detail': 'فایل جدید الزامی است'}, status=400)

        new = Content.objects.create(
            name=request.data.get('name') or old.name,
            description=old.description,
            type=old.type,
            status=STATUS_UPLOADED,
            original_file=upload,
            size_bytes=upload.size,
            uploaded_by=request.user,
            expiry_date=old.expiry_date,
            html_entry=old.html_entry if old.type == 'html' else None,
            text_data=old.text_data if old.type == 'text' else None,
        )
        new.tags.set(old.tags.all())
        old.superseded_by = new
        old.save(update_fields=['superseded_by'])
        audit(request.user, 'content.replace', 'content', str(new.id),
              {'replaced_content': str(old.id), 'name': new.name})
        return Response(self.get_serializer(new).data, status=201)

    @action(detail=True, methods=['get'])
    def usage(self, request, pk=None):
        content = self.get_object()
        playlists = list(
            Playlist.objects.filter(items__content=content).distinct().order_by('name')
        )
        playlist_ids = [p.id for p in playlists]
        active_deployments = (
            Deployment.objects.filter(
                version__playlist_id__in=playlist_ids,
                status__in=NON_TERMINAL_DEPLOYMENT_STATUSES,
            ).count()
            if playlist_ids
            else 0
        )
        return Response({
            'playlists': [{'id': str(p.id), 'name': p.name} for p in playlists],
            'active_deployments': active_deployments,
        })

    @action(detail=True, methods=['get'])
    def assets(self, request, pk=None):
        content = self.get_object()
        qs = content.assets.all().order_by('page_number', 'created_at')
        return Response(RenderedAssetSerializer(qs, many=True, context=self.get_serializer_context()).data)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """دانلود فایل اصلی از پنل (توکن دستگاه از مسیر /device-api/v1/files/ سرو می‌شود)."""
        content = self.get_object()
        if not content.original_file:
            return Response({'detail': 'فایل اصلی موجود نیست'}, status=404)
        return serve_ranged(request, content.original_file)

    @action(detail=True, methods=['post'])
    def reprocess(self, request, pk=None):
        """صف مجدد پردازش (وقتی broker در لحظه آپلود در دسترس نبوده)."""
        content = self.get_object()
        if content.status not in ('uploaded', 'failed'):
            return Response({'detail': 'فقط محتوای آپلودشده یا ناموفق قابل پردازش مجدد است'}, status=409)
        try:
            from core.tasks import process_content

            process_content.delay(str(content.pk))
        except Exception:
            return Response({'detail': 'ارسال به صف پردازش ناموفق بود؛ worker در دسترس نیست'}, status=503)
        return Response({'detail': 'پردازش مجدد در صف قرار گرفت'})
