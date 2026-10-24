from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class PanelUserAdmin(UserAdmin):
    list_display = ('username', 'email', 'roles', 'is_superuser', 'is_active', 'date_joined')
    list_filter = ('is_superuser', 'is_active')
    fieldsets = UserAdmin.fieldsets + (('نقش‌ها', {'fields': ('roles',)}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('نقش‌ها', {'fields': ('roles',)}),)
