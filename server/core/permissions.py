"""مجوزهای نقش‌محور پنل (قرارداد §1.1).

نقش‌ها: admin | content_manager | publisher | viewer
- خواندن (GET/HEAD/OPTIONS): برای همه کاربران احراز‌شده پنل
- نوشتن محتوا/برنامه نمایش: content_manager|admin
- انتشار/لغو/فرمان دستگاه: publisher|admin
- کاربران/تنظیمات: فقط admin (با IsAdminRole)
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission


class RolePermission(BasePermission):
    message = 'شما مجوز انجام این عملیات را ندارید'

    def has_permission(self, request, view):
        user = request.user
        if not (user and getattr(user, 'is_authenticated', False)):
            return False
        roles = getattr(user, 'roles', None)
        if roles is None:
            # توکن دستگاه روی اندپوینت پنل
            return False
        role_set = set(roles)
        if user.is_superuser or 'admin' in role_set:
            return True
        if request.method in SAFE_METHODS:
            if getattr(view, 'admin_only_read', False):
                return False
            return True
        action = getattr(view, 'action', None)
        allowed = getattr(view, 'write_roles', None) or ['admin']
        action_roles = getattr(view, 'action_roles', None)
        if action and action_roles:
            allowed = action_roles.get(action, allowed)
        return bool(role_set & set(allowed))


class IsAdminRole(BasePermission):
    message = 'این عملیات فقط برای مدیر سیستم مجاز است'

    def has_permission(self, request, view):
        user = request.user
        if not (user and getattr(user, 'is_authenticated', False)):
            return False
        roles = getattr(user, 'roles', None)
        if roles is None:
            return False
        return user.is_superuser or 'admin' in set(roles)
