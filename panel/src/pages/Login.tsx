import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';
import { authApi, extractError } from '../api';
import { useAuth } from '../store/auth';
import { Button, Card, Field, Input, ToastHost } from '../components/ui';
import { toast } from '../store/toast';
import type { AuthResponse } from '../types';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuth((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(username, password);
      setAuth(data.access, data.refresh, data.user);
      toast.success(`خوش آمدید، ${data.user.username}!`);
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <ToastHost />
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500">
            <MonitorSmartphone size={28} className="text-slate-950" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">سامانه مدیریت نمایشگرهای آسانسور</h1>
          <p className="text-sm text-slate-500">برای ادامه وارد حساب کاربری خود شوید</p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="نام کاربری">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="admin"
              />
            </Field>
            <Field label="گذرواژه">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </Field>

            {error && (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
            )}

            <Button type="submit" loading={loading} className="w-full">
              ورود
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-600">نسخه ۱.۰ — پنل مدیریت محتوا و دستگاه‌ها</p>
      </div>
    </div>
  );
}
