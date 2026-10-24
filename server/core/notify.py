import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

GROUP_NAME = 'dashboard'


def notify_dashboard(event_type, payload):
    """ارسال رویداد به مصرف‌کننده داشبورد.

    شکل پیام (قرارداد §5):
        {"type": "device.updated", "payload": {...}}
        {"type": "deployment.updated", "payload": {...}}
    اگر channel layer در دسترس نباشد، امن و بی‌صدا رد می‌شود.
    """
    try:
        layer = get_channel_layer()
        if layer is None:
            return
        async_to_sync(layer.group_send)(
            GROUP_NAME,
            {'type': 'dashboard.event', 'message': {'type': event_type, 'payload': payload}},
        )
    except Exception:
        logger.warning('ارسال رویداد داشبورد ناموفق بود (%s)', event_type, exc_info=True)
