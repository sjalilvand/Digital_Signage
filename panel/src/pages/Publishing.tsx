import { useCallback, useEffect, useState } from 'react';
import { MonitorSmartphone, Send, AlertTriangle, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import { devicesApi, extractError, playlistsApi, publishApi } from '../api';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, EmptyState, Field, Input,
  Modal, PageLoader, ProgressBar, Select, Table, ToastHost,
} from '../components/ui';
import { toast } from '../store/toast';
import {
  daysOfWeekLabel, deploymentStatusColor, deploymentStatusLabel, deviceStatusColor,
  recurrenceLabel, scheduleSummary, scheduleTypeLabel,
} from '../labels';
import type { Deployment, DeploymentStatus, Device, Playlist, PublishVersion, Recurrence, Schedule, ScheduleType } from '../types';

const SCHEDULE_TYPES: ScheduleType[] = ['immediate', 'scheduled', 'recurring', 'expiry'];

interface VersionLite { id: string; playlist_name: string; version_no: number }

export default function Publishing() {
  return (
    <div className="space-y-8">
      <ToastHost />
      <PublishWizard />
      <DeploymentsTable />
    </div>
  );
}

// ================================================================ جادوگر انتشار
function PublishWizard() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // گام ۱: برنامه
  const [playlistId, setPlaylistId] = useState('');
  // گام ۲: مقصدها
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  // گام ۳: زمان‌بندی
  const [scheduleType, setScheduleType] = useState<ScheduleType>('immediate');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [timeOfDay, setTimeOfDay] = useState('');
  const [highPriority, setHighPriority] = useState(false);

  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ version: PublishVersion; deployments: Deployment[] } | null>(null);

  useEffect(() => {
    Promise.all([playlistsApi.list(), devicesApi.list()])
      .then(([pl, dv]) => {
        const playlistsArr = Array.isArray(pl.data) ? pl.data : pl.data.results ?? [];
        setPlaylists(playlistsArr);
        setDevices(Array.isArray(dv.data) ? dv.data : dv.data.results ?? []);
      })
      .catch((e) => toast.error(extractError(e)))
      .finally(() => setLoading(false));
  }, []);

  const allSelected = devices.length > 0 && deviceIds.length === devices.length;

  const buildSchedule = (): Schedule => {
    const iso = (v: string) => (v ? dayjs(v).toISOString() : null);
    const s: Schedule = {
      type: scheduleType,
      start_at: null,
      end_at: null,
      recurrence: 'none',
      days_of_week: [],
      time_of_day: null,
    };
    if (scheduleType === 'scheduled') {
      s.start_at = iso(startAt);
      s.end_at = iso(endAt);
    } else if (scheduleType === 'recurring') {
      s.recurrence = recurrence;
      s.days_of_week = recurrence === 'weekly' ? [...days].sort() : [];
      s.time_of_day = timeOfDay || null;
      s.end_at = iso(endAt);
    } else if (scheduleType === 'expiry') {
      s.end_at = iso(endAt);
    }
    return s;
  };

  const submit = async () => {
    if (!playlistId) {
      toast.error('یک برنامه نمایش را انتخاب کنید');
      return;
    }
    if (deviceIds.length === 0) {
      toast.error('حداقل یک دستگاه مقصد را انتخاب کنید');
      return;
    }
    setPublishing(true);
    try {
      const { data } = await publishApi.publish({
        playlist_id: playlistId,
        device_ids: deviceIds,
        priority: highPriority ? 'high' : 'normal',
        schedule: buildSchedule(),
      });
      toast.success('انتشار انجام شد؛ دستگاه‌ها به‌محض اتصال دریافت می‌کنند');
      setResult({ version: data.version, deployments: data.deployments ?? [] });
      window.dispatchEvent(new CustomEvent('deployments-changed'));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) return <PageLoader message="در حال دریافت اطلاعات…" />;

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Send size={18} className="text-emerald-400" /> انتشار برنامه نمایش</span>} />
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        {/* گام ۱ — انتخاب برنامه */}
        <section className="space-y-3 rounded-xl border border-slate-800 p-3">
          <h4 className="text-sm font-bold text-emerald-400">① انتخاب برنامه نمایش</h4>
          {playlists.length === 0 ? (
            <p className="text-sm text-slate-500">هنوز برنامه‌ای ساخته نشده است. ابتدا از «برنامه‌های نمایش» یکی بسازید.</p>
          ) : (
            <div className="space-y-1">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlaylistId(p.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-sm transition-colors ${
                    playlistId === p.id
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-slate-500">{p.items?.length ?? 0} آیتم</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* گام ۲ — انتخاب دستگاه‌ها */}
        <section className="space-y-3 rounded-xl border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-cyan-400">② دستگاه‌های مقصد</h4>
            {devices.length > 0 && (
              <button
                type="button"
                className="text-xs text-cyan-400 hover:underline"
                onClick={() => setDeviceIds(allSelected ? [] : devices.map((d) => d.id))}
              >
                {allSelected ? 'پاک کردن همه' : `هر ${devices.length} دستگاه`}
              </button>
            )}
          </div>
          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">دستگاهی ثبت نشده است. ابتدا از بخش «دستگاه‌ها» باکس را اضافه کنید.</p>
          ) : (
            <div className="space-y-2">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <Checkbox
                    label={<span className="flex items-center gap-1"><MonitorSmartphone size={14} /> {d.name}</span>}
                    checked={deviceIds.includes(d.id)}
                    onChange={(v) => setDeviceIds((prev) => (v ? [...prev, d.id] : prev.filter((x) => x !== d.id)))}
                  />
                  <Badge
                    label={d.status === 'online' ? 'آنلاین' : 'آفلاین'}
                    color={d.status === 'online' ? deviceStatusColor.online : deviceStatusColor.offline}
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* گام ۳ — زمان‌بندی */}
        <section className="space-y-3 rounded-xl border border-slate-800 p-3">
          <h4 className="text-sm font-bold text-indigo-400">③ زمان‌بندی و اولویت</h4>

          <div className="flex flex-wrap gap-2">
            {SCHEDULE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setScheduleType(t)}
                className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                  scheduleType === t
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {scheduleTypeLabel[t]}
              </button>
            ))}
          </div>

          {scheduleType === 'scheduled' && (
            <div className="grid gap-2">
              <Field label="شروع">
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
              </Field>
              <Field label="پایان (اختیاری)">
                <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
              </Field>
            </div>
          )}

          {scheduleType === 'recurring' && (
            <div className="space-y-2">
              <Field label="تناوب">
                <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                  <option value="daily">روزانه</option>
                  <option value="weekly">هفتگی</option>
                </Select>
              </Field>
              {recurrence === 'weekly' && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">روزهای هفته</p>
                  <div className="flex flex-wrap gap-2">
                    {daysOfWeekLabel.map((lbl, i) => (
                      <Checkbox
                        key={i}
                        label={lbl}
                        checked={days.includes(i)}
                        onChange={(v) => setDays((prev) => (v ? [...prev, i] : prev.filter((x) => x !== i)))}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="ساعت پخش">
                  <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
                </Field>
                <Field label="پایان اعتبار (اختیاری)">
                  <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {scheduleType === 'expiry' && (
            <Field label="پایان اعتبار">
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </Field>
          )}

          {scheduleType === 'immediate' && (
            <p className="text-xs text-slate-500">انتشار بلافاصله در صف دریافت دستگاه‌ها قرار می‌گیرد.</p>
          )}

          <div className="border-t border-slate-800 pt-3">
            <Checkbox
              label="اولویت بالا (اطلاعیه فوری)"
              checked={highPriority}
              onChange={setHighPriority}
            />
            {highPriority && (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                اطلاعیه فوری به دستگاه قطع‌شده از شبکه فوراً نمی‌رسد؛ پس از بازگشت ارتباط دریافت می‌شود.
              </p>
            )}
          </div>

          <Button onClick={submit} loading={publishing} className="w-full">
            انتشار
          </Button>
        </section>
      </div>

      {/* نتیجه انتشار */}
      {result && (
        <div className="border-t border-slate-800 p-4">
          <p className="mb-2 text-sm text-emerald-300">
            نسخه {result.version.version_no} از «{result.version.playlist_name}» برای {result.deployments.length} دستگاه ایجاد شد.
          </p>
          <div className="flex flex-wrap gap-2">
            {result.deployments.map((d) => (
              <Badge key={d.id} label={deploymentStatusLabel[d.status] ?? d.status} color={deploymentStatusColor[d.status]} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ================================================================ جدول انتشارها
function DeploymentsTable() {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [versions, setVersions] = useState<VersionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [fDevice, setFDevice] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Deployment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await publishApi.deployments({
        device: fDevice || undefined,
        status: fStatus || undefined,
      });
      setRows(Array.isArray(data) ? data : data.results ?? []);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [fDevice, fStatus]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    const onChanged = () => load();
    window.addEventListener('deployments-changed', onChanged);
    return () => {
      clearInterval(iv);
      window.removeEventListener('deployments-changed', onChanged);
    };
  }, [load]);

  useEffect(() => {
    Promise.all([devicesApi.list(), publishApi.versions()])
      .then(([dv, vs]) => {
        setDevices(Array.isArray(dv.data) ? dv.data : dv.data.results ?? []);
        const vdata = vs.data;
        const list: VersionLite[] = Array.isArray(vdata)
          ? vdata
          : vdata.results ?? [];
        setVersions(list.map((v) => ({ id: v.id, playlist_name: v.playlist_name, version_no: v.version_no })));
      })
      .catch(() => undefined);
  }, []);

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.name ?? '—';
  const versionInfo = (id: string) => versions.find((v) => v.id === id);

  const doCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await publishApi.cancelDeployment(cancelTarget.id);
      toast.success('انتشار لغو شد');
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setCancelling(false);
    }
  };

  const cancellable = (s: DeploymentStatus) => s === 'pending_connection' || s === 'downloading';

  return (
    <Card>
      <CardHeader
        title="انتشارهای اخیر"
        actions={
          <div className="flex gap-2">
            <Select value={fDevice} onChange={(e) => setFDevice(e.target.value)} className="w-36">
              <option value="">همه دستگاه‌ها</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
            <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="w-40">
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(deploymentStatusLabel).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>
        }
      />

      <div className="p-4">
        {loading && rows.length === 0 ? (
          <PageLoader message="در حال دریافت انتشارها…" />
        ) : rows.length === 0 ? (
          <EmptyState message="هنوز انتشار ثبت نشده است." />
        ) : (
          <Table head={['دستگاه', 'برنامه', 'نسخه', 'اولویت', 'زمان‌بندی', 'وضعیت', 'پیشرفت', 'تاریخ', '']}>
            {rows.map((d) => {
              const v = versionInfo(d.version_id);
              return (
                <tr key={d.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200">{deviceName(d.device_id)}</td>
                  <td className="px-4 py-3 text-slate-300">{v?.playlist_name ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{v?.version_no ? `نسخه ${v.version_no}` : '—'}</td>
                  <td className="px-4 py-3">
                    <Badge
                      label={d.priority === 'high' ? 'بالا (فوری)' : 'عادی'}
                      color={d.priority === 'high' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'}
                    />
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-xs text-slate-400" title={scheduleSummary(d.schedule)}>
                    {scheduleSummary(d.schedule)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={deploymentStatusLabel[d.status] ?? d.status} color={deploymentStatusColor[d.status]} />
                    {d.error && <p className="mt-1 text-[11px] text-red-400">{d.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {d.status === 'downloading' ? (
                      <div className="w-28 space-y-1">
                        <ProgressBar value={d.progress ?? 0} />
                        <p className="text-[11px] text-cyan-300">{d.progress ?? 0}٪</p>
                      </div>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{dayjs(d.created_at).format('YYYY/MM/DD HH:mm')}</td>
                  <td className="px-4 py-3">
                    {cancellable(d.status) && (
                      <Button variant="ghost" className="text-red-400" onClick={() => setCancelTarget(d)}>
                        <XCircle size={15} />
                        لغو
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        title="لغو انتشار"
        message="این انتشار (در انتظار ارتباط یا در حال دریافت) لغو شود؟"
        confirmLabel="لغو انتشار"
        danger
        loading={cancelling}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </Card>
  );
}
