from django.contrib import admin

from .models import Content, RenderedAsset, Tag


class RenderedAssetInline(admin.TabularInline):
    model = RenderedAsset
    extra = 0


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(Content)
class ContentAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'status', 'size_bytes', 'uploaded_by', 'created_at', 'expiry_date')
    list_filter = ('type', 'status')
    search_fields = ('name', 'sha256')
    readonly_fields = ('sha256', 'size_bytes', 'duration_sec', 'pdf_pages', 'width', 'height')
    inlines = [RenderedAssetInline]


@admin.register(RenderedAsset)
class RenderedAssetAdmin(admin.ModelAdmin):
    list_display = ('content', 'kind', 'page_number', 'size_bytes', 'created_at')
    list_filter = ('kind',)
