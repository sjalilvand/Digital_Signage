from django.utils import timezone


def server_time_iso():
    """زمان سرور به‌صورت ISO-8601 با آفست (قرارداد §0)."""
    return timezone.localtime(timezone.now()).isoformat()
