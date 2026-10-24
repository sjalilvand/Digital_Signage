"""اندپوینت‌های دستگاه: پنل (JWT) + دستگاه (/device-api/v1/، Device Token).

- پنل: devices router + regenerate-token / status-history / commands / rollback
- دستگاه: enroll / manifest / report-status / report-playback / ack-command / files (Range)
"""
import secrets

from django.db import models
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import audit
from core.auth import DeviceTokenAuthentication, IsDevice
from core.files import serve_ranged
from core.models import Setting
from core.notify import notify_dashboard
from core.permissions import RolePermission
from core.utils import server_time_iso
from library.models import Content, RenderedAsset
from publishing.models import PublishVersion
from publishing.services import update_deployment_status

from .models import Device, DeviceCommand, DeviceStatusReport, PlaybackLog
from .serializers import (
    DeviceCommandSerializer,
    DeviceSerializer,
    DeviceStatusReportSerializer,
    PlaybackLogInSerializer,
)

DEVICE_REPORTABLE_STATUSES = ('downloading', 'ready', 'active', 'playing', 'failed')


# ======================================================================
# پنل — DeviceViewSet
# ======================================================================
class DeviceViewSet(viewsets.ModelViewSet):
    queryset = Device.objects.select_related('active_version', 'download_version').all()
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    write_roles = ['publisher', 'admin']

    def perform_create(self, serializer):
        device = serializer.save()
        audit(self.request.user, 'device.create', 'device', str(device.id), {'name': device.name})
        notify_dashboard('device.updated', DeviceSerializer(device).data)

    def perform_update(self, serializer):
        device = serializer.save()
        details = {'name': device.name}
        if device.is_blocked:
            details['blocked'] = True
            audit(self.request.user, 'device.block', 'device', str(device.id), details)
        else:
            audit(self.request.user, 'device.update', 'device', str(device.id), details)
        notify_dashboard('device.updated', DeviceSerializer(device).data)

    @action(detail=True, methods=['post'], url_path='regenerate-token')
    def regenerate_token(self, request, pk=None):
        device = self.get_object()
        device.device_token = secrets.token_hex(20)
        device.save(update_fields=['device_token'])
        audit(request.user, 'device.regenerate_token', 'device', str(device.id), {'name': device.name})
        return Response({'device_token': device.device_token})

    @action(detail=True, methods=['get'], url_path='status-history')
    def status_history(self, request, pk=None):
        device = self.get_object()
        try:
            limit = min(max(int(request.query_params.get('limit', 50)), 1), 200)
        except (TypeError, ValueError):
            limit = 50
        reports = device.status_reports.all()[:limit]
        return Response(DeviceStatusReportSerializer(reports, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def commands(self, request, pk=None):
        device = self.get_object()
        if request.method == 'GET':
            return Response(DeviceCommandSerializer(device.commands.all(), many=True).data)

        action_name = request.data.get('action')
        valid_actions = [choice[0] for choice in DeviceCommand.ACTION_CHOICES]
        if action_name not in valid_actions:
            raise ValidationError({'action': ['فرمان نامعتبر است']})
        params = request.data.get('params')
        if params in (None, ''):
            params = {}
        if not isinstance(params, dict):
            raise ValidationError({'params': ['پارامترها باید یک شیء JSON باشند']})
        command = DeviceCommand.objects.create(device=device, action=action_name, params=params)
        audit(request.user, 'device.command', 'device_command', command.id,
              {'device': str(device.id), 'action': action_name, 'params': params})
        return Response(DeviceCommandSerializer(command).data, status=201)

    @action(detail=True, methods=['post'])
    def rollback(self, request, pk=None):
        """فعال‌سازی نسخه «ready» قبلی؛ نسخه فعال فعلی → replaced (قرارداد §3)."""
        device = self.get_object()
        current = (
            device.deployments.filter(status__in=('active', 'playing')).select_related('version').first()
        )
        candidates = device.deployments.filter(status='ready').select_related('version')
        if current is not None:
            candidates = candidates.exclude(pk=current.pk)
        target = candidates.order_by('-created_at').first()
        if target is None:
            return Response({'detail': 'نسخه قبلی آماده نیست'}, status=409)

        with transaction.atomic():
            if current is not None:
                current.status = 'replaced'
                current.save(update_fields=['status'])
            target.status = 'active'
            target.activated_at = timezone.now()
            target.progress = 100
            target.error = None
            target.save(update_fields=['status', 'activated_at', 'progress', 'error'])
            device.active_version = target.version
            device.playing_item = None
            device.save(update_fields=['active_version', 'playing_item'])

        audit(request.user, 'device.rollback', 'device', str(device.id), {
            'to_deployment': str(target.id),
            'version_no': target.version.version_no,
        })
        if current is not None:
            notify_dashboard('deployment.updated', _dep_payload(current))
        notify_dashboard('deployment.updated', _dep_payload(target))
        notify_dashboard('device.updated', DeviceSerializer(device).data)
        return Response(_dep_payload(target))


def _dep_payload(deployment):
    from publishing.serializers import DeploymentSerializer

    return DeploymentSerializer(deployment).data


# ======================================================================
# دستگاه — /device-api/v1/
# ======================================================================
class EnrollView(APIView):
    """POST /device-api/v1/enroll/ — جفت‌سازی یک‌بارمصرف با pairing_code (قرارداد §1.2)."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        code = (request.data.get('pairing_code') or '').strip().upper()
        if not code:
            return Response({'detail': 'کد جفت‌سازی نامعتبر است'}, status=400)
        device = Device.objects.filter(pairing_code=code).first()
        if device is None:
            return Response({'detail': 'کد جفت‌سازی نامعتبر است'}, status=400)
        now = timezone.now()
        if device.pairing_code_expires_at and device.pairing_code_expires_at < now:
            return Response({'detail': 'کد جفت‌سازی نامعتبر است'}, status=400)
        if device.is_blocked:
            return Response({'detail': 'دستگاه مسدود شده است'}, status=403)

        device.device_token = secrets.token_hex(20)
        device.pairing_code = None
        device.pairing_code_expires_at = None
        device.last_seen_at = now
        device.is_online_flag = True
        device.save()

        poll_interval = Setting.get_solo().default_poll_interval_sec
        audit(None, 'device.enroll', 'device', str(device.id), {'name': device.name})
        notify_dashboard('device.updated', DeviceSerializer(device).data)
        return Response({
            'device_id': str(device.id),
            'device_token': device.device_token,
            'server_time': server_time_iso(),
            'device_name': device.name,
            'poll_interval_sec': poll_interval,
        })


def _manifest_files(content):
    files = []
    if content is None or content.status != 'ready':
        return files
    if content.original_file:
        files.append({
            'role': 'original',
            'url': f'/device-api/v1/files/{content.id}/original/',
            'sha256': content.sha256,
            'size': content.size_bytes if content.size_bytes is not None else content.original_file.size,
        })
    if content.type == 'pdf':
        for asset in content.assets.filter(kind='pdf_page').order_by('page_number'):
            files.append({
                'role': 'pdf_page',
                'page': asset.page_number,
                'url': f'/device-api/v1/files/{content.id}/assets/{asset.id}/',
                'sha256': asset.sha256,
                'size': asset.size_bytes,
            })
    return files


class ManifestView(APIView):
    """GET /device-api/v1/manifest/ — وضعیت مطلوب دستگاه (قرارداد §4.1)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def get(self, request):
        device = request.user  # شیء Device
        setting = Setting.get_solo()

        deployments = (
            device.deployments.select_related('version', 'version__playlist')
            .exclude(status__in=('cancelled', 'replaced'))
            .annotate(_prio_rank=models.Case(
                models.When(priority='high', then=models.Value(0)),
                default=models.Value(1),
                output_field=models.IntegerField(),
            ))
            .order_by('_prio_rank', 'created_at')
        )

        content_ids = []
        for deployment in deployments:
            for item in (deployment.version.snapshot or {}).get('items', []):
                if item.get('content_id') and item['content_id'] not in content_ids:
                    content_ids.append(item['content_id'])
        content_map = {
            str(c.id): c
            for c in Content.objects.filter(id__in=content_ids).prefetch_related('assets')
        }

        versions = []
        for deployment in deployments:
            snapshot = deployment.version.snapshot or {}
            items = []
            for item in snapshot.get('items', []):
                content = content_map.get(str(item.get('content_id')))
                items.append({
                    'order': item.get('order'),
                    'content_id': item.get('content_id'),
                    'content_name': item.get('content_name'),
                    'type': item.get('type'),
                    'duration_sec': item.get('duration_sec'),
                    'mute': item.get('mute'),
                    'volume': item.get('volume'),
                    'fit_mode': item.get('fit_mode'),
                    'background_color': item.get('background_color'),
                    'pdf_pages': item.get('pdf_pages'),
                    'pdf_seconds_per_page': item.get('pdf_seconds_per_page'),
                    'repeat_count': item.get('repeat_count'),
                    'text_data': item.get('text_data'),
                    'files': _manifest_files(content),
                })
            versions.append({
                'deployment_id': str(deployment.id),
                'version_id': str(deployment.version_id),
                'version_no': deployment.version.version_no,
                'priority': deployment.priority,
                'playlist_name': deployment.version.playlist.name if deployment.version.playlist else '',
                'schedule': deployment.schedule,
                'server_hint_status': deployment.status,
                'items': items,
            })

        pending_commands = list(device.commands.filter(status='pending').order_by('created_at'))
        commands = [{'id': c.id, 'action': c.action, 'params': c.params} for c in pending_commands]
        if pending_commands:
            DeviceCommand.objects.filter(id__in=[c.id for c in pending_commands]).update(status='sent')

        device.last_seen_at = timezone.now()
        device.is_online_flag = True
        device.save(update_fields=['last_seen_at', 'is_online_flag'])

        return Response({
            'server_time': server_time_iso(),
            'poll_interval_sec': setting.default_poll_interval_sec,
            'device': {'id': str(device.id), 'name': device.name},
            'versions': versions,
            'commands': commands,
        })


class ReportStatusView(APIView):
    """POST /device-api/v1/report/status/ — به‌روزرسانی وضعیت دستگاه و انتشارها (قرارداد §4.2)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def post(self, request):
        device = request.user
        data = request.data
        if not isinstance(data, dict):
            return Response({'detail': 'بدنه درخواست نامعتبر است'}, status=400)

        if data.get('model'):
            device.model = str(data['model'])[:100]
        if data.get('android_version'):
            device.android_version = str(data['android_version'])[:20]
        if data.get('app_version'):
            device.app_version = str(data['app_version'])[:20]
        if data.get('free_space_mb') is not None:
            try:
                device.free_space_mb = int(data['free_space_mb'])
            except (TypeError, ValueError):
                pass

        network = data.get('network') or 'wifi'
        # قرارداد §4.2: با network=disconnected گزارش پذیرفته می‌شود ولی last_seen جلو نمی‌رود
        if network != 'disconnected':
            device.last_seen_at = timezone.now()
            device.is_online_flag = True

        errors = []
        for report in data.get('deployments') or []:
            if not isinstance(report, dict):
                continue
            deployment_id = report.get('deployment_id')
            status = report.get('status')
            if not deployment_id or status not in DEVICE_REPORTABLE_STATUSES:
                continue
            progress = report.get('progress') if status == 'downloading' else None
            deployment = update_deployment_status(
                deployment_id, status,
                progress=progress,
                error=report.get('error'),
                device=device,
            )
            if deployment is None:
                continue
            if status == 'downloading':
                device.download_version = deployment.version
                device.download_progress = deployment.progress or 0
            elif status in ('active', 'playing'):
                device.active_version = deployment.version
                if device.download_version_id == deployment.version_id:
                    device.download_version = None
                    device.download_progress = 100
            elif status == 'ready':
                if device.download_version_id == deployment.version_id:
                    device.download_version = None
                    device.download_progress = 100
            if status == 'failed' and report.get('error'):
                errors.append(str(report['error']))

        playing = data.get('playing')
        if isinstance(playing, dict) and playing.get('version_id'):
            try:
                device.active_version = PublishVersion.objects.get(pk=playing['version_id'])
            except (PublishVersion.DoesNotExist, ValueError, TypeError):
                pass
            if playing.get('content_id'):
                name = (
                    Content.objects.filter(pk=playing['content_id'])
                    .values_list('name', flat=True)
                    .first()
                )
                if name:
                    device.playing_item = name

        if errors:
            device.last_error = errors[0][:500]

        device.save()
        DeviceStatusReport.objects.create(device=device, payload=data)
        notify_dashboard('device.updated', DeviceSerializer(device).data)
        return Response({'ok': True, 'server_time': server_time_iso()})


class ReportPlaybackView(APIView):
    """POST /device-api/v1/report/playback/ — تکی یا batch (قرارداد §4.3)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def post(self, request):
        data = request.data
        if isinstance(data, dict) and 'batch' in data:
            items = data.get('batch')
        elif isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            items = [data]
        else:
            items = None
        if not isinstance(items, list) or not items:
            return Response({'detail': 'بدنه درخواست نامعتبر است'}, status=400)

        serializer = PlaybackLogInSerializer(data=items, many=True)
        serializer.is_valid(raise_exception=True)
        logs = []
        for item in serializer.validated_data:
            logs.append(PlaybackLog(device=request.user, **item))
        PlaybackLog.objects.bulk_create(logs)
        return Response({'ok': True, 'created': len(logs), 'server_time': server_time_iso()})


class AckCommandView(APIView):
    """POST /device-api/v1/ack/command/ — تایید اجرای فرمان (قرارداد §4.4)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def post(self, request):
        command_id = request.data.get('command_id')
        command = DeviceCommand.objects.filter(pk=command_id, device=request.user).first()
        if command is None:
            return Response({'detail': 'فرمان یافت نشد'}, status=404)
        command.status = 'acknowledged'
        command.acknowledged_at = timezone.now()
        result = request.data.get('result')
        command.result = None if result is None else str(result)
        command.save(update_fields=['status', 'acknowledged_at', 'result'])
        return Response({'ok': True, 'server_time': server_time_iso()})


class DeviceOriginalFileView(APIView):
    """GET /device-api/v1/files/{content_id}/original/ — با پشتیبانی Range (§4.5)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def get(self, request, content_id):
        content = get_object_or_404(Content, pk=content_id)
        if not content.original_file:
            return Response({'detail': 'فایل اصلی موجود نیست'}, status=404)
        return serve_ranged(request, content.original_file)


class DeviceAssetFileView(APIView):
    """GET /device-api/v1/files/{content_id}/assets/{asset_id}/ — با پشتیبانی Range (§4.5)."""

    authentication_classes = [DeviceTokenAuthentication]
    permission_classes = [IsDevice]

    def get(self, request, content_id, asset_id):
        asset = get_object_or_404(RenderedAsset, pk=asset_id, content_id=content_id)
        if not asset.file:
            return Response({'detail': 'فایل دارایی موجود نیست'}, status=404)
        return serve_ranged(request, asset.file)
