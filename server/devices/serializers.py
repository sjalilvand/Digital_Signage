from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from core.models import Setting

from .models import Device, DeviceCommand, DeviceStatusReport, PlaybackLog, generate_pairing_code


class DeviceSerializer(serializers.ModelSerializer):
    """خروجی دقیق قرارداد §2.5."""

    status = serializers.SerializerMethodField()
    active_version_id = serializers.PrimaryKeyRelatedField(source='active_version', read_only=True)
    active_version_no = serializers.SerializerMethodField()
    download_version_id = serializers.PrimaryKeyRelatedField(source='download_version', read_only=True)

    class Meta:
        model = Device
        fields = [
            'id', 'name', 'pairing_code', 'pairing_code_expires_at',
            'model', 'android_version', 'app_version', 'status', 'last_seen_at',
            'free_space_mb', 'active_version_id', 'active_version_no', 'playing_item',
            'download_version_id', 'download_progress', 'last_error', 'is_blocked', 'created_at',
        ]
        read_only_fields = [
            'id', 'pairing_code', 'pairing_code_expires_at', 'model', 'android_version',
            'app_version', 'status', 'last_seen_at', 'free_space_mb', 'active_version_id',
            'active_version_no', 'playing_item', 'download_version_id', 'download_progress',
            'last_error', 'created_at',
        ]

    def get_status(self, obj):
        if not obj.last_seen_at:
            return 'offline'
        threshold = Setting.get_solo().online_threshold_sec
        online = (timezone.now() - obj.last_seen_at).total_seconds() <= threshold
        return 'online' if online else 'offline'

    def get_active_version_no(self, obj):
        return obj.active_version.version_no if obj.active_version else None

    def create(self, validated_data):
        pairing_code = generate_pairing_code()
        while Device.objects.filter(pairing_code=pairing_code).exists():
            pairing_code = generate_pairing_code()
        device = Device.objects.create(
            pairing_code=pairing_code,
            pairing_code_expires_at=timezone.now() + timedelta(hours=24),
            **validated_data,
        )
        return device


class DeviceCommandSerializer(serializers.ModelSerializer):
    """خروجی دقیق قرارداد §2.6."""

    device_id = serializers.PrimaryKeyRelatedField(source='device', read_only=True)

    class Meta:
        model = DeviceCommand
        fields = ['id', 'device_id', 'action', 'params', 'status', 'created_at', 'acknowledged_at', 'result']


class DeviceStatusReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceStatusReport
        fields = ['id', 'payload', 'created_at']


class PlaybackLogInSerializer(serializers.Serializer):
    """ورودی POST /device-api/v1/report/playback/ (تکی یا داخل batch)."""

    version_id = serializers.UUIDField()
    deployment_id = serializers.UUIDField(required=False, allow_null=True)
    content_id = serializers.UUIDField()
    started_at = serializers.DateTimeField()
    duration_sec = serializers.FloatField(required=False, allow_null=True)
    completed = serializers.BooleanField(required=False, default=False)
    error = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def create(self, validated_data):
        return PlaybackLog.objects.create(**validated_data)


class PlaybackLogSerializer(serializers.ModelSerializer):
    """خروجی GET /api/v1/reports/playback/."""

    device_id = serializers.PrimaryKeyRelatedField(source='device', read_only=True)

    class Meta:
        model = PlaybackLog
        fields = [
            'id', 'device_id', 'version_id', 'deployment_id', 'content_id',
            'started_at', 'duration_sec', 'completed', 'error', 'created_at',
        ]
