from rest_framework import serializers

from accounts.serializers import UserMiniSerializer

from .models import Deployment, PublishVersion


class PublishVersionSerializer(serializers.ModelSerializer):
    """خروجی دقیق قرارداد §2.3."""

    playlist_id = serializers.PrimaryKeyRelatedField(source='playlist', read_only=True)
    playlist_name = serializers.CharField(source='playlist.name', read_only=True)
    created_by = UserMiniSerializer(read_only=True)

    class Meta:
        model = PublishVersion
        fields = ['id', 'playlist_id', 'playlist_name', 'version_no', 'created_by', 'created_at', 'snapshot']


class DeploymentSerializer(serializers.ModelSerializer):
    """خروجی دقیق قرارداد §2.4."""

    version_id = serializers.PrimaryKeyRelatedField(source='version', read_only=True)
    device_id = serializers.PrimaryKeyRelatedField(source='device', read_only=True)
    created_by = UserMiniSerializer(read_only=True)

    class Meta:
        model = Deployment
        fields = [
            'id', 'version_id', 'device_id', 'priority', 'schedule', 'status',
            'progress', 'error', 'created_by', 'created_at', 'activated_at',
        ]
