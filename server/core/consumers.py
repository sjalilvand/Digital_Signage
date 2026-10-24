"""مصرف‌کننده WebSocket داشبورد پنل — /ws/dashboard/?token=<jwt> (قرارداد §5)."""
from urllib.parse import parse_qs

from asgiref.sync import async_to_sync
from channels.generic.websocket import JsonWebsocketConsumer
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import AccessToken

GROUP_NAME = 'dashboard'


class DashboardConsumer(JsonWebsocketConsumer):
    """احراز با JWT در query string؛ اتصال نامعتبر بسته می‌شود (4401)."""

    def connect(self):
        query = self.scope.get('query_string', b'')
        raw = query.decode('utf-8') if isinstance(query, bytes) else str(query)
        token = (parse_qs(raw).get('token') or [None])[0]
        if not token:
            self.close(code=4401)
            return
        try:
            AccessToken(token)
        except TokenError:
            self.close(code=4401)
            return
        async_to_sync(self.channel_layer.group_add)(GROUP_NAME, self.channel_name)
        self.accept()

    def disconnect(self, code):
        try:
            async_to_sync(self.channel_layer.group_discard)(GROUP_NAME, self.channel_name)
        except Exception:
            pass

    def dashboard_event(self, message):
        """گروه: {'type': 'dashboard.event', 'message': {...}} → ارسال به پنل."""
        self.send_json(message.get('message') or {})
