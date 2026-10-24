import { useCallback, useEffect, useState } from 'react';
import { Users as UsersIcon, Plus, Pencil, Trash2 } from 'lucide-react';
import { extractError, usersApi } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageLoader,
  Table, ToastHost,
} from '../components/ui';
import { toast } from '../store/toast';
import { displayName, roleLabel } from '../store/auth';
import type { Role, User } from '../types';

const ROLES: Role[] = ['admin', 'content_manager', 'publisher', 'viewer'];

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<User | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await usersApi.list();
      setUsers(Array.isArray(data) ? data : data.results ?? []);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usersApi.remove(deleteTarget.id);
      toast.success('کاربر حذف شد');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ToastHost />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">مدیریت کاربران پنل و نقش‌های آن‌ها.</p>
        <Button onClick={() => setEditUser('new')}>
          <Plus size={16} />
          کاربر جدید
        </Button>
      </div>

      {loading && users.length === 0 ? (
        <PageLoader message="در حال دریافت کاربران…" />
      ) : users.length === 0 ? (
        <Card>
          <EmptyState message="کاربری یافت نشد." icon={<UsersIcon size={32} />} />
        </Card>
      ) : (
        <Table head={['نام', 'نام کاربری', 'نقش‌ها', '']}>
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-slate-900/60">
              <td className="px-4 py-3 text-slate-200">{displayName(u)}</td>
              <td className="px-4 py-3 text-slate-400" dir="ltr">{u.username}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} label={roleLabel(r)} color="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" />
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <Button variant="secondary" onClick={() => setEditUser(u)}>
                    <Pencil size={14} />
                    ویرایش
                  </Button>
                  <Button variant="ghost" className="text-red-400" onClick={() => setDeleteTarget(u)}>
                    <Trash2 size={14} />
                    حذف
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {editUser && (
        <UserModal
          user={editUser === 'new' ? null : editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف کاربر"
        message={`آیا از حذف کاربر «${deleteTarget ? displayName(deleteTarget) : ''}» مطمئن هستید؟`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName, setLastName] = useState(user?.last_name ?? '');
  const [roles, setRoles] = useState<Role[]>(user?.roles ?? ['viewer']);
  const [saving, setSaving] = useState(false);

  const toggleRole = (r: Role, on: boolean) =>
    setRoles((prev) => (on ? (prev.includes(r) ? prev : [...prev, r]) : prev.filter((x) => x !== r)));

  const submit = async () => {
    if (!username.trim()) {
      toast.error('نام کاربری را وارد کنید');
      return;
    }
    if (!user && !password) {
      toast.error('برای کاربر جدید گذرواژه الزامی است');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username,
        first_name: firstName,
        last_name: lastName,
        roles,
      };
      if (password) body.password = password;
      if (user) {
        await usersApi.update(user.id, body);
        toast.success('کاربر به‌روزرسانی شد');
      } else {
        await usersApi.create(body);
        toast.success('کاربر ساخته شد');
      }
      onSaved();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={user ? `ویرایش کاربر: ${displayName(user)}` : 'کاربر جدید'}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="نام کاربری">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" autoFocus />
          </Field>
          <Field label={user ? 'گذرواژه جدید (اختیاری)' : 'گذرواژه'}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          </Field>
          <Field label="نام">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field label="نام خانوادگی">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-slate-400">نقش‌ها</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={roles.includes(r)}
                  onChange={(e) => toggleRole(r, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-emerald-500"
                />
                <span className="text-slate-300">{roleLabel(r)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button onClick={submit} loading={saving}>ذخیره</Button>
          <Button variant="secondary" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Modal>
  );
}
