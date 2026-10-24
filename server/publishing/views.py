"""اندپوینت‌های انتشار پنل: POST /publish/، deployments + cancel، publish-versions."""
from django.db import transaction
from django.db.models import Max
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import audit
from core.notify import notify_dashboard
from core.permissions import RolePermission
from devices.models import Device
from playlists.models import Playlist

from .models import Deployment, PublishVersion
from .serializers import DeploymentSerializer, PublishVersionSerializer
from .services import build_snapshot, normalize_schedule, update_deployment_status


class PublishVersionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        PublishVersion.objects.select_related('playlist', 'created_by').order_by('-created_at')
    )
    serializer_class = PublishVersionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        playlist_id = self.request.query_params.get('playlist')
        if playlist_id:
            qs = qs.filter(playlist_id=playlist_id)
        return qs


class PublishView(APIView):
    """POST /api/v1/publish/ → یک PublishVersion + N Deployment (قرارداد §3)."""

    permission_classes = [IsAuthenticated, RolePermission]
    write_roles = ['publisher', 'admin']

    def post(self, request):
        playlist_id = request.data.get('playlist_id')
        device_ids = request.data.get('device_ids')
        priority = request.data.get('priority') or 'normal'
        schedule = request.data.get('schedule')

        if not playlist_id:
            raise ValidationError({'playlist_id': ['شناسه برنامه نمایش الزامی است']})
        try:
            playlist = Playlist.objects.get(pk=playlist_id)
        except (Playlist.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'برنامه نمایش یافت نشد'}, status=404)
        if not isinstance(device_ids, list) or not device_ids:
            raise ValidationError({'device_ids': ['حداقل یک دستگاه انتخاب کنید']})
        if priority not in ('normal', 'high'):
            raise ValidationError({'priority': ['اولویت باید normal یا high باشد']})
        schedule = normalize_schedule(schedule)

        unique_ids = list(dict.fromkeys(str(d) for d in device_ids))
        devices = list(Device.objects.filter(id__in=unique_ids))
        if len(devices) != len(unique_ids):
            raise ValidationError({'device_ids': ['یک یا چند دستگاه یافت نشد']})

        with transaction.atomic():
            locked_playlist = Playlist.objects.select_for_update().get(pk=playlist.pk)
            snapshot = build_snapshot(locked_playlist)
            if not snapshot.get('items'):
                raise ValidationError({'detail': ['برنامه نمایش خالی است؛ ابتدا محتوا اضافه کنید']})
            last_version_no = (
                PublishVersion.objects.filter(playlist=locked_playlist)
                .aggregate(m=Max('version_no'))['m']
                or 0
            )
            version = PublishVersion.objects.create(
                playlist=locked_playlist,
                version_no=last_version_no + 1,
                snapshot=snapshot,
                created_by=request.user,
            )
            deployments = []
            for device in devices:
                deployment, _ = Deployment.objects.get_or_create(
                    version=version,
                    device=device,
                    defaults={
                        'priority': priority,
                        'schedule': schedule,
                        'created_by': request.user,
                    },
                )
                deployments.append(deployment)

        audit(request.user, 'publish', 'publish_version', str(version.id), {
            'playlist': locked_playlist.name,
            'version_no': version.version_no,
            'devices': [str(d.id) for d in devices],
            'priority': priority,
            'schedule': schedule,
        })
        for deployment in deployments:
            notify_dashboard('deployment.updated', DeploymentSerializer(deployment).data)

        return Response(
            {
                'version': PublishVersionSerializer(version).data,
                'deployments': DeploymentSerializer(deployments, many=True).data,
            },
            status=201,
        )


class DeploymentViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /deployments/?device=&status=&version= و POST /deployments/{id}/cancel/."""

    serializer_class = DeploymentSerializer
    permission_classes = [IsAuthenticated, RolePermission]
    write_roles = ['publisher', 'admin']

    def get_queryset(self):
        qs = Deployment.objects.select_related('version', 'device', 'created_by').order_by('-created_at')
        qp = self.request.query_params
        if qp.get('device'):
            qs = qs.filter(device_id=qp['device'])
        if qp.get('status'):
            qs = qs.filter(status=qp['status'])
        if qp.get('version'):
            qs = qs.filter(version_id=qp['version'])
        return qs

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        deployment = self.get_object()
        if deployment.status not in ('pending_connection', 'downloading'):
            return Response({'detail': 'فقط انتشارهای در انتظار قابل لغو هستند'}, status=409)
        deployment.status = 'cancelled'
        deployment.save(update_fields=['status'])
        audit(request.user, 'deployment.cancel', 'deployment', str(deployment.id), {
            'device': str(deployment.device_id),
            'version': str(deployment.version_id),
        })
        notify_dashboard('deployment.updated', DeploymentSerializer(deployment).data)
        return Response(DeploymentSerializer(deployment).data)
