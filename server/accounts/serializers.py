"""سریالایزرهای کاربر + لاگین JWT (قرارداد §1.1)."""
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.exceptions import ValidationError

from .models import ROLES, User


class UserMiniSerializer(serializers.ModelSerializer):
    """خلاصه کاربر برای فیلدهای تو در تو (uploaded_by / created_by / ...)."""

    class Meta:
        model = User
        fields = ['id', 'username']


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'roles']


class UserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=False,
        error_messages={'blank': 'رمز عبور نمی‌تواند خالی باشد'},
    )

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'roles', 'password']

    def validate_roles(self, value):
        if value in (None, ''):
            return ['viewer']
        if not isinstance(value, list):
            raise ValidationError('roles باید آرایه‌ای از نقش‌ها باشد')
        invalid = [r for r in value if r not in ROLES]
        if invalid:
            raise ValidationError('نقش(های) نامعتبر: {}'.format(', '.join(map(str, invalid))))
        return value

    def validate_username(self, value):
        qs = User.objects.filter(username=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise ValidationError('این نام کاربری قبلاً استفاده شده است')
        return value

    def validate_password(self, value):
        if value is not None and len(value) < 6:
            raise ValidationError('رمز عبور باید حداقل ۶ کاراکتر باشد')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise ValidationError({'password': ['رمز عبور الزامی است']})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class LoginSerializer(TokenObtainPairSerializer):
    """پاسخ: {"access", "refresh", "user": {...roles...}} — دقیقاً مطابق قرارداد."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username'] = user.username
        token['roles'] = user.role_list
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data
