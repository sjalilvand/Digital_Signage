from rest_framework import serializers

from accounts.serializers import UserMiniSerializer
from devices.models import PlaybackLog

from .models import AuditLog, Setting


class SettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Setting
        fields = [
            'online_threshold_sec', 'pdf_dpi', 'pdf_jpeg_quality',
            'max_upload_gb', 'default_poll_interval_sec',
        ]


class AuditLogSerializer(serializers.ModelSerializer):
    user = UserMiniSerializer(read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user', 'action', 'object_type', 'object_id', 'details', 'created_at']


class PlaybackReportSerializer(serializers.ModelSerializer):
    device_id = serializers.PrimaryKeyRelatedField(source='device', read_only=True)
    content_name = serializers.SerializerMethodField()

    class Meta:
        model = PlaybackLog
        fields = [
            'id', 'device_id', 'version_id', 'deployment_id', 'content_id',
            'content_name', 'started_at', 'duration_sec', 'completed', 'error', 'created_at',
        ]

    def get_content_name(self, obj):
        from library.models import Content

        return Content.objects.filter(id=obj.content_id).values_list('name', flat=True).first()
