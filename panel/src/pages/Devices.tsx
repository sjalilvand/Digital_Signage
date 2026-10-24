import { useCallback, useEffect, useState } from 'react';
import {
  MonitorSmartphone, Plus, RefreshCw, Pause, Play, Volume2, Undo2, Eraser,
  Ban, KeyRound, ShieldOff, ShieldCheck, Wifi, WifiOff, HardDrive, AlertCircle,
} from 'lucide-react';
import { devicesApi, extractError } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageLoader,
  ProgressBar, TagChip, ToastHost,
} from '../components/ui';
import { toast } from '../store/toast';
import { deviceStatusColor, deviceStatusLabel, formatDateTime, humanSize, timeAgo } from '../labels';
import type { Device, DeviceStatusReport } from '../types';

export default function Devices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await devicesApi.list();
      setDevices(Array.isArray(data) ? data : data.results ?? []);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, [load]);

  return (
    <div className="space-y-4">
      <ToastHost />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          باکس‌های اندروید نصب‌شده در آسانسورها. هر باکس پس از جفت‌سازی با کد یک‌بارمصرف به سامانه متصل می‌شود.
        </p>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} />
          افزودن دستگاه
        </Button>
      </div>

      {loading && devices.length === 0 ? (
        <PageLoader message="در حال دریافت دستگاه‌ها…" />
      ) : devices.length === 0 ? (
        <Card>
          <EmptyState message="دستگاهی ثبت نشده است. با دکمه «افزودن دستگاه» اولین باکس را اضافه کنید." icon={<MonitorSmartphone size={32} />} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} onChanged={load} onOpenDetail={() => setDetailId(d.id)} />
          ))}
        </div>
      )}

      {detailId && (
        <DeviceDetailModal deviceId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}

      <AddDeviceModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(d) => {
          setAddOpen(false);
          load();
          if (d.pairing_code) {
            toast.info(`دستگاه ساخته شد — کد جفت‌سازی: ${d.pairing_code}`);
          }
        }}
      />
    </div>
  );
}

// ================================================================ کارت دستگاه
function DeviceCard({ device: d, onChanged, onOpenDetail }: { device: Device; onChanged: () => void; onOpenDetail: () => void }) {
  const [blocking, setBlocking] = useState(false);
  const online = d.status === 'online';

  const toggleBlock = async () => {
    setBlocking(true);
    try {
      await devicesApi.update(d.id, { is_blocked: !d.is_blocked });
      toast.success(d.is_blocked ? 'دسترسی دستگاه برقرار شد' : 'دسترسی دستگاه قطع شد');
      onChanged();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setBlocking(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
            <MonitorSmartphone size={20} />
          </div>
          <div>
            <button type="button" onClick={onOpenDetail} className="font-semibold text-slate-100 hover:text-emerald-300">
              {d.name}
            </button>
            <p className="text-xs text-slate-500">
              {d.model ?? '—'} • اندروید {d.android_version ?? '—'} • اپ {d.app_version ?? '—'}
            </p>
          </div>
        </div>
        <Badge label={deviceStatusLabel[d.status]} color={deviceStatusColor[d.status]} />
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-slate-400">
        <p className="flex items-center gap-1">
          <HardDrive size={13} />
          فضای آزاد: {d.free_space_mb != null ? humanSize(d.free_space_mb * 1024 * 1024) : '—'}
        </p>
        <p>نسخه فعال: {d.active_version_no ? `نسخه ${d.active_version_no}` : '—'}</p>
        <p>در حال نمایش: {d.playing_item ?? '—'}</p>
        <p>آخرین ارتباط: {timeAgo(d.last_seen_at)}</p>
        {d.download_version_id && (
          <div className="space-y-1 pt-1">
            <ProgressBar value={d.download_progress ?? 0} />
            <p className="text-cyan-300">در حال دریافت: {d.download_progress ?? 0}٪</p>
          </div>
        )}
        {d.last_error && (
          <p className="flex items-start gap-1 rounded bg-red-500/10 px-2 py-1 text-red-300">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            {d.last_error}
          </p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onOpenDetail}>
          جزئیات و فرمان‌ها
        </Button>
        <Button
          variant={d.is_blocked ? 'success' : 'ghost'}
          onClick={toggleBlock}
          loading={blocking}
          title="قطع دسترسی"
        >
          {d.is_blocked ? <ShieldCheck size={15} /> : <ShieldOff size={15} />}
          {d.is_blocked ? 'رفع قطعی' : 'قطع دسترسی'}
        </Button>
      </div>
    </Card>
  );
}

// ================================================================ افزودن دستگاه
function AddDeviceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (d: Device) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      toast.error('نام دستگاه را وارد کنید');
      return;
    }
    setSaving(true);
    try {
      const { data } = await devicesApi.create({ name });
      toast.success('دستگاه ساخته شد');
      onCreated(data);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="افزودن دستگاه جدید">
      <div className="space-y-3">
        <Field label="نام دستگاه" hint="مثلاً: آسانسور شرقی — برج B">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="آسانسور ۱" autoFocus />
        </Field>
        <p className="rounded-lg bg-cyan-500/10 px-3 py-2 text-xs leading-5 text-cyan-300">
          پس از ثبت، کد جفت‌سازی ۸ رقمی صادر می‌شود؛ این کد را یک‌بار در اپلیکیشن باکس وارد کنید.
        </p>
        <div className="flex gap-2">
          <Button onClick={submit} loading={saving}>ثبت دستگاه</Button>
          <Button variant="secondary" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================================================================ جزئیات دستگاه
function DeviceDetailModal({ deviceId, onClose, onChanged }: { deviceId: string; onClose: () => void; onChanged: () => void }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [history, setHistory] = useState<DeviceStatusReport[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [volume, setVolume] = useState(50);
  const [regenOpen, setRegenOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, h] = await Promise.all([
        devicesApi.get(deviceId),
        devicesApi.statusHistory(deviceId, 50).catch(() => ({ data: [] as DeviceStatusReport[] })),
      ]);
      setDevice(d.data);
      setHistory(Array.isArray(h.data) ? h.data : h.data.results ?? []);
    } catch (err) {
      toast.error(extractError(err));
    }
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  const sendCommand = async (action: string, label: string, params?: Record<string, unknown>) => {
    setBusy(action);
    try {
      await devicesApi.commands(deviceId, { action, params });
      toast.success(`فرمان «${label}» ارسال شد`);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setBusy('regen');
    try {
      const { data } = await devicesApi.regenerateToken(deviceId);
      setDevice(data);
      setRegenOpen(false);
      toast.success('توکن جدید صادر شد؛ توکن قبلی باطل است');
      onChanged();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleBlock = async () => {
    if (!device) return;
    try {
      const { data } = await devicesApi.update(device.id, { is_blocked: !device.is_blocked });
      setDevice(data);
      toast.success(data.is_blocked ? 'دسترسی دستگاه قطع شد' : 'دسترسی دستگاه برقرار شد');
      onChanged();
    } catch (err) {
      toast.error(extractError(err));
    }
  };

  if (!device) {
    return (
      <Modal open onClose={onClose} title="جزئیات دستگاه">
        <PageLoader message="در حال دریافت اطلاعات دستگاه…" />
      </Modal>
    );
  }

  const online = device.status === 'online';

  return (
    <Modal open onClose={onClose} title={`دستگاه: ${device.name}`} wide>
      <div className="space-y-4">
        <ToastHost />

        {/* اطلاعات کلی */}
        <div className="grid gap-x-4 gap-y-2 rounded-xl border border-slate-800 p-3 text-sm sm:grid-cols-2">
          <InfoRow label="وضعیت اتصال">
            <Badge label={deviceStatusLabel[device.status]} color={deviceStatusColor[device.status]} />
          </InfoRow>
          <InfoRow label="آخرین ارتباط">{timeAgo(device.last_seen_at)}</InfoRow>
          <InfoRow label="مدل">{device.model ?? '—'}</InfoRow>
          <InfoRow label="نسخه اندروید">{device.android_version ?? '—'}</InfoRow>
          <InfoRow label="نسخه اپلیکیشن">{device.app_version ?? '—'}</InfoRow>
          <InfoRow label="فضای آزاد">
            {device.free_space_mb != null ? `${humanSize(device.free_space_mb * 1024 * 1024)} (${device.free_space_mb} مگابایت)` : '—'}
          </InfoRow>
          <InfoRow label="نسخه فعال">{device.active_version_no ? `نسخه ${device.active_version_no}` : '—'}</InfoRow>
          <InfoRow label="آیتم در حال نمایش">{device.playing_item ?? '—'}</InfoRow>
          {device.download_version_id && (
            <div className="sm:col-span-2">
              <p className="mb-1 text-xs text-cyan-300">در حال دریافت نسخه — {device.download_progress ?? 0}٪</p>
              <ProgressBar value={device.download_progress ?? 0} />
            </div>
          )}
          {device.last_error && (
            <p className="flex items-start gap-1 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 sm:col-span-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              آخرین خطا: {device.last_error}
            </p>
          )}
        </div>

        {/* جفت‌سازی */}
        <div className="rounded-xl border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 font-semibold text-slate-100">
              <KeyRound size={16} className="text-cyan-400" />
              جفت‌سازی
            </h4>
            <Button variant="secondary" onClick={() => setRegenOpen(true)} loading={busy === 'regen'}>
              <RefreshCw size={14} />
              صدور توکن جدید
            </Button>
          </div>
          {device.pairing_code ? (
            <div className="mt-3 space-y-2">
              <p className="text-center font-mono text-4xl font-bold tracking-[0.35em] text-emerald-400" dir="ltr">
                {device.pairing_code}
              </p>
              <p className="text-center text-xs text-slate-500">
                اعتبار تا: {formatDateTime(device.pairing_code_expires_at)}
              </p>
              <p className="rounded-lg bg-cyan-500/10 px-3 py-2 text-center text-xs leading-5 text-cyan-300">
                این کد را یک‌بار در اپلیکیشن باکس وارد کنید؛ پس از جفت‌سازی دیگر نمایش داده نمی‌شود.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              این دستگاه جفت‌سازی شده است. در صورت گم‌شدن توکن، با «صدور توکن جدید» دوباره جفت‌سازی کنید.
            </p>
          )}
        </div>

        {/* فرمان‌ها */}
        <div className="rounded-xl border border-slate-800 p-3">
          <h4 className="mb-3 font-semibold text-slate-100">فرمان‌ها</h4>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => sendCommand('refresh_status', 'دریافت وضعیت')} loading={busy === 'refresh_status'}>
              <RefreshCw size={14} />
              دریافت وضعیت
            </Button>
            <Button variant="secondary" onClick={() => sendCommand('pause_playback', 'توقف موقت')} loading={busy === 'pause_playback'}>
              <Pause size={14} />
              توقف موقت
            </Button>
            <Button variant="secondary" onClick={() => sendCommand('resume_playback', 'ادامه پخش')} loading={busy === 'resume_playback'}>
              <Play size={14} />
              ادامه
            </Button>
            <Button variant="secondary" onClick={() => sendCommand('rollback', 'بازگشت به برنامه قبلی')} loading={busy === 'rollback'}>
              <Undo2 size={14} />
              بازگشت به برنامه قبلی
            </Button>
            <Button variant="secondary" onClick={() => sendCommand('cleanup_files', 'پاکسازی فایل‌ها')} loading={busy === 'cleanup_files'}>
              <Eraser size={14} />
              پاکسازی فایل‌ها
            </Button>
            <Button variant="secondary" onClick={() => sendCommand('cancel_pending', 'لغو انتشار در انتظار')} loading={busy === 'cancel_pending'}>
              <Ban size={14} />
              لغو انتشار در انتظار
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
            <span className="flex items-center gap-1 text-sm text-slate-400">
              <Volume2 size={15} />
              تغییر صدا: {volume}٪
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-48 accent-emerald-500"
            />
            <Button onClick={() => sendCommand('set_volume', `تنظیم صدا روی ${volume}٪`, { volume })} loading={busy === 'set_volume'}>
              اعمال
            </Button>
          </div>
        </div>

        {/* قطع دسترسی */}
        <div className="flex items-center justify-between rounded-xl border border-slate-800 p-3">
          <div>
            <p className="text-sm font-medium text-slate-200">دسترسی دستگاه</p>
            <p className="text-xs text-slate-500">در حالت قطع، دستگاه از دریافت محتوا و فرمان‌ها منع می‌شود.</p>
          </div>
          <Button variant={device.is_blocked ? 'success' : 'danger'} onClick={toggleBlock}>
            {device.is_blocked ? (
              <>
                <ShieldCheck size={15} />
                رفع قطع دسترسی
              </>
            ) : (
              <>
                <ShieldOff size={15} />
                قطع دسترسی
              </>
            )}
          </Button>
        </div>

        {/* تاریخچه وضعیت */}
        <div className="rounded-xl border border-slate-800 p-3">
          <h4 className="mb-2 font-semibold text-slate-100">تاریخچه وضعیت‌های گزارش‌شده</h4>
          {history.length === 0 ? (
            <EmptyState message="گزارشی ثبت نشده است." />
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto text-xs">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950 px-3 py-2">
                  <span className="text-slate-500">{formatDateTime(h.created_at)}</span>
                  <Badge
                    label={h.network === 'disconnected' ? 'شبکه قطع' : 'شبکه متصل'}
                    color={h.network === 'disconnected' ? deviceStatusColor.offline : deviceStatusColor.online}
                  />
                  <span className="text-slate-400">
                    {h.app_version ? `اپ ${h.app_version}` : ''}
                    {h.free_space_mb != null ? ` • فضای آزاد ${humanSize(h.free_space_mb * 1024 * 1024)}` : ''}
                  </span>
                  {h.deployments?.map((dep) => (
                    <TagChip key={dep.deployment_id} label={`${dep.status}${dep.progress != null ? ` ${dep.progress}٪` : ''}`} />
                  ))}
                  {h.playing && <span className="text-cyan-300">در حال پخش آیتم {h.playing.item_order}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            ثبت‌شده: {formatDateTime(device.created_at)}
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={regenOpen}
        title="صدور توکن جدید"
        message="توکن قبلی دستگاه باطل می‌شود و باکس باید دوباره با کد جفت‌سازی جدید ثبت شود. ادامه می‌دهید؟"
        confirmLabel="صدور توکن جدید"
        danger
        loading={busy === 'regen'}
        onConfirm={regenerate}
        onCancel={() => setRegenOpen(false)}
      />
    </Modal>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-200">{children}</span>
    </div>
  );
}
