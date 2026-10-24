from rest_framework import serializers

from accounts.serializers import UserMiniSerializer

from .models import Content, RenderedAsset


class ContentSerializer(serializers.ModelSerializer):
    """خروجی دقیق قرارداد §2.1."""

    tags = serializers.SerializerMethodField()
    uploaded_by = UserMiniSerializer(read_only=True)
    thumbnail_url = serializers.SerializerMethodField()
    original_url = serializers.SerializerMethodField()
    superseded_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Content
        fields = [
            'id', 'name', 'description', 'type', 'status', 'error_message',
            'size_bytes', 'duration_sec', 'pdf_pages', 'width', 'height',
            'sha256', 'thumbnail_url', 'tags', 'uploaded_by', 'created_at',
            'expiry_date', 'html_entry', 'text_data', 'original_url', 'superseded_by',
        ]

    def get_tags(self, obj):
        return list(obj.tags.values_list('name', flat=True))

    def get_thumbnail_url(self, obj):
        try:
            return obj.thumbnail.url if obj.thumbnail else None
        except ValueError:
            return None

    def get_original_url(self, obj):
        return f'/device-api/v1/files/{obj.id}/original/'


class ContentWriteSerializer(serializers.ModelSerializer):
    """ورودی ساخت/ویرایش محتوا (multipart: file + name, type, ...)."""

    expiry_date = serializers.DateField(
        required=False,
        allow_null=True,
        error_messages={'invalid': 'تاریخ انقضا باید به شکل yyyy-mm-dd باشد'},
    )

    class Meta:
        model = Content
        fields = ['name', 'description', 'type', 'original_file', 'expiry_date', 'html_entry', 'text_data']
        extra_kwargs = {
            'name': {'required': False, 'max_length': 255},
            'description': {'required': False},
            'original_file': {'required': False, 'allow_null': True},
            'html_entry': {'required': False, 'allow_null': True},
            'text_data': {'required': False, 'allow_null': True},
        }


class RenderedAssetSerializer(serializers.ModelSerializer):
    """خروجی GET /contents/{id}/assets/ (قرارداد §3)."""

    url = serializers.SerializerMethodField()

    class Meta:
        model = RenderedAsset
        fields = ['id', 'kind', 'page_number', 'url', 'width', 'height', 'size_bytes']

    def get_url(self, obj):
        try:
            return obj.file.url if obj.file else None
        except ValueError:
            return None
