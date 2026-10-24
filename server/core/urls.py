from django.urls import path

from .views import AuditLogListView, DashboardView, PlaybackReportListView, SettingsView

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('settings/', SettingsView.as_view(), name='settings'),
    path('reports/playback/', PlaybackReportListView.as_view(), name='reports-playback'),
    path('reports/audit/', AuditLogListView.as_view(), name='reports-audit'),
]
