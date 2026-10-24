"""URLهای دستگاه — /device-api/v1/ (قرارداد §4)."""
from django.urls import path

from .views import (
    AckCommandView,
    DeviceAssetFileView,
    DeviceOriginalFileView,
    EnrollView,
    ManifestView,
    ReportPlaybackView,
    ReportStatusView,
)

urlpatterns = [
    path('enroll/', EnrollView.as_view(), name='device-enroll'),
    path('manifest/', ManifestView.as_view(), name='device-manifest'),
    path('report/status/', ReportStatusView.as_view(), name='device-report-status'),
    path('report/playback/', ReportPlaybackView.as_view(), name='device-report-playback'),
    path('ack/command/', AckCommandView.as_view(), name='device-ack-command'),
    path('files/<uuid:content_id>/original/', DeviceOriginalFileView.as_view(), name='device-file-original'),
    path('files/<uuid:content_id>/assets/<uuid:asset_id>/', DeviceAssetFileView.as_view(), name='device-file-asset'),
]
