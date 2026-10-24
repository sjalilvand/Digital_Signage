from django.contrib import admin

from .models import Playlist, PlaylistItem


class PlaylistItemInline(admin.TabularInline):
    model = PlaylistItem
    extra = 0
    fields = ('order', 'content', 'duration_sec', 'mute', 'volume', 'fit_mode', 'background_color',
              'pdf_pages', 'pdf_seconds_per_page', 'repeat_count')


@admin.register(Playlist)
class PlaylistAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_by', 'created_at', 'updated_at')
    search_fields = ('name',)
    inlines = [PlaylistItemInline]


@admin.register(PlaylistItem)
class PlaylistItemAdmin(admin.ModelAdmin):
    list_display = ('playlist', 'order', 'content', 'duration_sec', 'fit_mode')
