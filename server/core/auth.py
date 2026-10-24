"""احراز هویت دستگاه با هدر `Authorization: Device <device_token>` (قرارداد §1.2)."""
import logging

from devices.models import Device
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission

logger = logging.getLogger(__name__)


class DeviceTokenAuthentication(BaseAuthentication):
    keyword = 'device'

    def authenticate(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != self.keyword:
            return None
        token = parts[1]
        device = Device.objects.filter(device_token=token).first()
        if device is None:
            raise AuthenticationFailed('توکن دستگاه نامعتبر است')
        if device.is_blocked:
            raise AuthenticationFailed('دستگاه مسدود شده است', code=403)
        return (device, None)

    def authenticate_header(self, request):
        # بدون این، درخواست بدون توکن 403 می‌شود؛ قرارداد §7 برای 401 نیاز دارد
        return 'Device realm="signage"'


class IsDevice(BasePermission):
    """دسترسی فقط برای دستگاه احراز‌شده و مسدودنشده."""

    message = 'احراز هویت دستگاه الزامی است'

    def has_permission(self, request, view):
        user = request.user
        return isinstance(user, Device) and not user.is_blocked
