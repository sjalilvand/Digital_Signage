from django.contrib import admin

from .models import Deployment, PublishVersion


@admin.register(PublishVersion)
class PublishVersionAdmin(admin.ModelAdmin):
    list_display = ('playlist', 'version_no', 'created_by', 'created_at')
    list_filter = ('playlist',)
    readonly_fields = ('snapshot',)


@admin.register(Deployment)
class DeploymentAdmin(admin.ModelAdmin):
    list_display = ('version', 'device', 'priority', 'status', 'progress', 'created_at', 'activated_at')
    list_filter = ('status', 'priority')
    search_fields = ('device__name',)
