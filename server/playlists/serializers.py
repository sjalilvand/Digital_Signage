from rest_framework import serializers

from library.models import STATUS_READY, Content

from .models import FIT_MODES, Playlist, PlaylistItem


class PlaylistItemReadSerializer(serializers.ModelSerializer):
    content_id = serializers.PrimaryKeyRelatedField(source='content', read_only=True)
    content_name = serializers.CharField(source='content.name', read_only=True)
    audio_bg_content_id = serializers.SerializerMethodField()

    class Meta:
        model = PlaylistItem
        fields = [
            'id', 'order', 'content_id', 'content_name', 'duration_sec',
            'mute', 'volume', 'fit_mode', 'background_color',
            'pdf_pages', 'pdf_seconds_per_page', 'repeat_count', 'audio_bg_content_id',
        ]

    def get_audio_bg_content_id(self, obj):
        # نسخه ۱ قرارداد: همیشه null
        return None


class PlaylistItemWriteSerializer(serializers.ModelSerializer):
    content_id = serializers.PrimaryKeyRelatedField(queryset=Content.objects.all(), source='content')

    class Meta:
        model = PlaylistItem
        fields = [
            'content_id', 'duration_sec', 'mute', 'volume', 'fit_mode',
            'background_color', 'pdf_pages', 'pdf_seconds_per_page', 'repeat_count',
        ]
        extra_kwargs = {
            'duration_sec': {'required': False, 'allow_null': True},
            'mute': {'required': False},
            'volume': {'required': False},
            'fit_mode': {'required': False},
            'background_color': {'required': False},
            'pdf_pages': {'required': False, 'allow_null': True},
            'pdf_seconds_per_page': {'required': False},
            'repeat_count': {'required': False, 'allow_null': True},
        }

    def validate_content_id(self, content):
        if content is None:
            raise serializers.ValidationError('محتوای انتخاب‌شده یافت نشد')
        if content.status != STATUS_READY:
            raise serializers.ValidationError(
                f'محتوا هنوز برای پخش آماده نیست (وضعیت فعلی: {content.status})'
            )
        return content

    def validate_pdf_pages(self, value):
        if value in (None, ''):
            return None
        if not isinstance(value, list) or not all(isinstance(p, int) and p >= 1 for p in value):
            raise serializers.ValidationError('pdf_pages باید آرایه‌ای از شماره صفحات (≥1) باشد')
        return value

    def validate(self, attrs):
        content = attrs.get('content')
        if attrs.get('pdf_pages') and content is not None and content.type != 'pdf':
            raise serializers.ValidationError({'pdf_pages': 'انتخاب صفحه فقط برای محتوای PDF مجاز است'})
        return attrs


class PlaylistSerializer(serializers.ModelSerializer):
    created_by = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = ['id', 'name', 'description', 'created_by', 'created_at', 'updated_at', 'items']

    def get_created_by(self, obj):
        if obj.created_by_id is None:
            return None
        return {'id': obj.created_by_id, 'username': obj.created_by.username}

    def get_items(self, obj):
        qs = obj.items.select_related('content').order_by('order', 'id')
        return PlaylistItemReadSerializer(qs, many=True).data
