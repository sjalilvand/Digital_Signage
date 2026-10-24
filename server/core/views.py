"""اندپوینت‌های هسته پنل: dashboard، settings، reports (قرارداد §3)."""
from datetime import datetime, time

from django.db.models import Count
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import audit
from core.permissions import IsAdminRole
from devices.models import Device, DeviceStatusReport, PlaybackLog
from devices.serializers import DeviceSerializer, DeviceStatusReportSerializer
from publishing.models import Deployment

from .models import AuditLog, Setting
from .serializers import AuditLogSerializer, PlaybackReportSerializer, SettingSerializer


class SettingsView(APIView):
    """GET/PATCH /api/v1/settings/ — فقط admin."""

    permission_classes = [IsAuthenticated, IsAdminRole]

    def get(self, request):
        return Response(SettingSerializer(Setting.get_solo()).data)

    def patch(self, request):
        setting = Setting.get_solo()
        serializer = SettingSerializer(setting, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit(request.user, 'settings.update', 'setting', '1', dict(request.data.items()))
        return Response(serializer.data)


class DashboardView(APIView):
    """GET /api/v1/dashboard/ — دستگاه‌ها + خلاصه انتشارها + شمارنده‌ها."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        setting = Setting.get_solo()
        now = timezone.now()
        devices = Device.objects.select_related('active_version', 'download_version').order_by('created_at')
        out = []
        counts = {'online': 0, 'offline': 0, 'deploying': 0}
        for device in devices:
            data = DeviceSerializer(device).data
            summary = {
                'pending_connection': 0, 'downloading': 0, 'ready': 0,
                'active': 0, 'playing': 0, 'failed': 0,
            }
            for row in device.deployments.values('status').annotate(c=Count('id')):
                if row['status'] in summary:
                    summary[row['status']] = row['c']
            data['deployments'] = summary
            out.append(data)
            online = bool(device.last_seen_at and (now - device.last_seen_at).total_seconds() <= setting.online_threshold_sec)
            counts['online' if online else 'offline'] += 1
        counts['deploying'] = Deployment.objects.filter(status__in=('pending_connection', 'downloading')).count()
        return Response({'devices': out, 'counts': counts})


def _parse_dt(value, start_of_day):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        date = parse_date(value)
        if date is None:
            return None
        parsed = datetime.combine(date, time.min if start_of_day else time.max)
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


class PlaybackReportListView(generics.ListAPIView):
    """GET /api/v1/reports/playback/?device=&from=&to=&page="""

    serializer_class = PlaybackReportSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PlaybackLog.objects.select_related('device').order_by('-created_at')
        qp = self.request.query_params
        if qp.get('device'):
            qs = qs.filter(device_id=qp['device'])
        dt_from = _parse_dt(qp.get('from'), True)
        dt_to = _parse_dt(qp.get('to'), False)
        if dt_from:
            qs = qs.filter(started_at__gte=dt_from)
        if dt_to:
            qs = qs.filter(started_at__lte=dt_to)
        return qs


class AuditLogListView(generics.ListAPIView):
    """GET /api/v1/reports/audit/?page= (+ فیلتر action/user/object_type)"""

    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = AuditLog.objects.select_related('user').all()
        qp = self.request.query_params
        if qp.get('action'):
            qs = qs.filter(action=qp['action'])
        if qp.get('user'):
            qs = qs.filter(user_id=qp['user'])
        if qp.get('object_type'):
            qs = qs.filter(object_type=qp['object_type'])
        return qs


class StatusHistoryFallbackView(generics.ListAPIView):
    """(کمکی) آخرین گزارش‌های وضعیت — برای اشکال‌زدایی پنل."""

    serializer_class = DeviceStatusReportSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        qs = DeviceStatusReport.objects.select_related('device')
        device = self.request.query_params.get('device')
        if device:
            qs = qs.filter(device_id=device)
        return qs[:50]
