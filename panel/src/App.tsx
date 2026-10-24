import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Film,
  ListVideo,
  Send,
  MonitorSmartphone,
  BarChart3,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  ShieldAlert,
} from 'lucide-react';
import { useAuth, isAdmin, displayName, roleLabel } from './store/auth';
import { ToastHost, Button } from './components/ui';
import { toast } from './store/toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Library from './pages/Library';
import Playlists from './pages/Playlists';
import Publishing from './pages/Publishing';
import Devices from './pages/Devices';
import Reports from './pages/Reports';
import UsersPage from './pages/Users';
import SettingsPage from './pages/Settings';
import type { User } from './types';

const NAV = [
  { to: '/', title: 'داشبورد', icon: LayoutDashboard, adminOnly: false },
  { to: '/library', title: 'کتابخانه محتوا', icon: Film, adminOnly: false },
  { to: '/playlists', title: 'برنامه‌های نمایش', icon: ListVideo, adminOnly: false },
  { to: '/publishing', title: 'انتشار', icon: Send, adminOnly: false },
  { to: '/devices', title: 'دستگاه‌ها', icon: MonitorSmartphone, adminOnly: false },
  { to: '/reports', title: 'گزارش‌ها', icon: BarChart3, adminOnly: false },
  { to: '/users', title: 'کاربران', icon: Users, adminOnly: true },
  { to: '/settings', title: 'تنظیمات', icon: SettingsIcon, adminOnly: true },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.to, n.title]));
TITLES['/login'] = 'ورود به سامانه';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const access = useAuth((s) => s.access);
  const location = useLocation();
  if (!access) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const user = useAuth((s) => s.user);
  if (!isAdmin(user)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
        <ShieldAlert size={40} className="text-red-400" />
        <p className="text-lg font-semibold">دسترسی ندارید</p>
        <p className="text-sm">این بخش فقط برای مدیر سامانه قابل مشاهده است.</p>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { access, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    toast.info('از سامانه خارج شدید');
    navigate('/login');
  };

  if (!access) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const title = TITLES[location.pathname] ?? 'سامانه مدیریت نمایشگرهای آسانسور';
  const navItems = NAV.filter((n) => !n.adminOnly || isAdmin(user));

  return (
    <div className="flex min-h-screen">
      {/* پوشش موبایل */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* نوار کناری — سمت راست (RTL) */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-slate-800 bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 font-bold text-slate-950">
            ن
          </div>
          <div>
            <p className="text-sm font-bold text-slate-100">نمایشگر آسانسور</p>
            <p className="text-[11px] text-slate-500">پنل مدیریت</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map(({ to, title: t, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon size={18} />
              {t}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-slate-200">{displayName(user)}</p>
            <p className="text-[11px] text-slate-500">
              {((user as User | null)?.roles ?? []).map((r) => roleLabel(r)).join('، ') || '—'}
            </p>
          </div>
          <Button variant="secondary" onClick={handleLogout} className="w-full">
            <LogOut size={16} />
            خروج
          </Button>
        </div>
      </aside>

      {/* بخش اصلی */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* نوار بالا */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="باز کردن منو"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-bold text-slate-100">{title}</h1>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Routes>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/library"
              element={
                <RequireAuth>
                  <Library />
                </RequireAuth>
              }
            />
            <Route
              path="/playlists"
              element={
                <RequireAuth>
                  <Playlists />
                </RequireAuth>
              }
            />
            <Route
              path="/publishing"
              element={
                <RequireAuth>
                  <Publishing />
                </RequireAuth>
              }
            />
            <Route
              path="/devices"
              element={
                <RequireAuth>
                  <Devices />
                </RequireAuth>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireAuth>
                  <Reports />
                </RequireAuth>
              }
            />
            <Route
              path="/users"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <UsersPage />
                  </RequireAdmin>
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <RequireAdmin>
                    <SettingsPage />
                  </RequireAdmin>
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}
