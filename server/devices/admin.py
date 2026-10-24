from django.contrib import admin

from .models import Device, DeviceCommand, DeviceStatusReport, PlaybackLog


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('name', 'model', 'app_version', 'status_flag', 'is_blocked',
                    'active_version', 'download_version', 'last_seen_at')
    list_filter = ('is_blocked',)
    search_fields = ('name',)
    readonly_fields = ('device_token', 'is_online_flag')

    @admin.display(boolean=True, description='کش آنلاین')
    def status_flag(self, obj):
        return obj.is_online_flag


@admin.register(DeviceStatusReport)
class DeviceStatusReportAdmin(admin.ModelAdmin):
    list_display = ('device', 'created_at')
    list_filter = ('device',)


@admin.register(DeviceCommand)
class DeviceCommandAdmin(admin.ModelAdmin):
    list_display = ('id', 'device', 'action', 'status', 'created_at', 'acknowledged_at')
    list_filter = ('action', 'status')


@admin.register(PlaybackLog)
class PlaybackLogAdmin(admin.ModelAdmin):
    list_display = ('device', 'content_id', 'started_at', 'duration_sec', 'completed')
    list_filter = ('completed', 'device')
