"""مدل کاربر پنل با نقش‌ها (admin | content_manager | publisher | viewer)."""
from django.contrib.auth.models import AbstractUser
from django.db import models

ROLE_ADMIN = 'admin'
ROLE_CONTENT_MANAGER = 'content_manager'
ROLE_PUBLISHER = 'publisher'
ROLE_VIEWER = 'viewer'
ROLES = [ROLE_ADMIN, ROLE_CONTENT_MANAGER, ROLE_PUBLISHER, ROLE_VIEWER]


def default_roles():
    """نقش پیش‌فرض: admin (برای createsuperuser محیطی مناسب است)."""
    return [ROLE_ADMIN]


class User(AbstractUser):
    roles = models.JSONField(default=default_roles, blank=True, verbose_name='نقش‌ها')

    class Meta:
        verbose_name = 'کاربر'
        verbose_name_plural = 'کاربران'
        ordering = ['id']

    def __str__(self):
        return self.username

    @property
    def role_list(self):
        return list(self.roles or [])
