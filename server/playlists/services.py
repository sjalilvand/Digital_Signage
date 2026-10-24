"""سرویس جایگزینی اتمیک آیتم‌های برنامه نمایش."""
from django.db import transaction
from rest_framework.exceptions import ValidationError

from .models import PlaylistItem
from .serializers import PlaylistItemWriteSerializer


def replace_items(playlist, items_data):
    """حذف کامل آیتم‌های فعلی و ساخت مجدد — اتمیک (قرارداد §3 PUT /playlists/{id}/items/)."""
    if items_data is None:
        items_data = []
    if not isinstance(items_data, list):
        raise ValidationError({'items': ['آیتم‌ها باید آرایه باشند']})

    with transaction.atomic():
        playlist.items.all().delete()
        for index, raw in enumerate(items_data, start=1):
            if not isinstance(raw, dict):
                raise ValidationError({'items': [f'آیتم شماره {index} نامعتبر است']})
            serializer = PlaylistItemWriteSerializer(data=raw)
            serializer.is_valid(raise_exception=True)
            validated = serializer.validated_data
            content = validated.pop('content')
            PlaylistItem.objects.create(playlist=playlist, order=index, content=content, **validated)
    return playlist
