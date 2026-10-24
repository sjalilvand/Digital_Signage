import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  access: string | null;
  refresh: string | null;
  user: User | null;
  setAuth: (access: string, refresh: string, user: User) => void;
  setAccess: (access: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      access: null,
      refresh: null,
      user: null,
      setAuth: (access, refresh, user) => set({ access, refresh, user }),
      setAccess: (access) => set({ access }),
      logout: () => set({ access: null, refresh: null, user: null }),
    }),
    { name: 'auth' },
  ),
);

export const hasRole = (user: User | null, ...roles: string[]): boolean => {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
};

export const isAdmin = (user: User | null): boolean => hasRole(user, 'admin');

/** نام کامل یا نام کاربری برای نمایش */
export const displayName = (user: User | null): string => {
  if (!user) return '';
  const full = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  return full || user.username;
};

export const roleLabel = (role: string): string => {
  const map: Record<string, string> = {
    admin: 'مدیر سامانه',
    content_manager: 'مدیر محتوا',
    publisher: 'مسئول انتشار',
    viewer: 'مشاهده‌گر',
  };
  return map[role] ?? role;
};
