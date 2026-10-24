import { useCallback, useEffect, useRef, useState } from 'react';
import { MonitorSmartphone, Wifi, WifiOff, AlertCircle, Activity, Download, UploadCloud, Radio } from 'lucide-react';
import { dashboardApi } from '../api';
import { openDashboardSocket } from '../ws';
import { Badge, Card, EmptyState, PageLoader, ProgressBar } from '../components/ui';
import {
  deviceStatusColor,
  deviceStatusLabel,
  deploymentStatusLabel,
  timeAgo,
} from '../labels';
import type { DashboardResponse, Deployment, Device, WsEvent } from '../types';

const POLL_INTERVAL_MS = 10_000;

export default function Dashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeWsRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await dashboardApi.get();
      setData(res.data);
      setLastUpdate(new Date());
    } catch {
      /* خطاها بی‌صدا — polling ادامه دارد */
    } finally {
      setLoading(false);
    }
  }, []);

  // بارگذاری اولیه + polling احتیاطی هر ۱۰ ثانیه (fallback همیشگی در کنار WS)
  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  // WebSocket زنده با اتصال مجدد + backoff
  useEffect(() => {
    const close = openDashboardSocket(
      (event: WsEvent) => {
        setLastUpdate(new Date());
        if (event.type === 'device.updated') {
          const device = event.payload as Device;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  devices: prev.devices.map((d) => (d.id === device.id ? { ...d, ...device } : d)),
                }
              : prev,
          );
        } else if (event.type === 'deployment.updated') {
          const dep = event.payload as Deployment;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  devices: prev.devices.map((d) => {
                    if (d.id !== dep.device_id) return d;
                    const next = { ...d };
                    if (dep.status === 'downloading') {
                      next.download_version_id = dep.version_id;
                      next.download_progress = dep.progress ?? 0;
                    } else {
                      next.download_version_id = null;
                      next.download_progress = 0;
                    }
                    if (dep.status === 'failed' && dep.error) next.last_error = dep.error;
                    return next;
                  }),
                }
              : prev,
          );
        }
      },
      // نشانگر اتصال زنده بلافاصله با باز شدن سوکت روشن می‌شود
      () => setWsConnected(true),
    );
    closeWsRef.current = close;
    // اگر پس از ۵ ثانیه WS باز نشده بود، نشانگر اتصال را خاموش بگذار
    const t = setTimeout(() => setWsConnected(false), 5000);
    return () => {
      clearTimeout(t);
      close();
    };
  }, []);

  if (loading && !data) return <PageLoader message="در حال دریافت وضعیت دستگاه‌ها…" />;
  if (!data) return <EmptyState message="داده‌ای برای نمایش وجود ندارد" />;

  const { devices, counts } = data;

  return (
    <div className="space-y-6">
      {/* نوار وضعیت */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge label={`آنلاین: ${counts.online}`} color="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" />
          <Badge label={`آفلاین: ${counts.offline}`} color="bg-red-500/20 text-red-300 border border-red-500/30" />
          <Badge label={`در حال انتشار: ${counts.deploying}`} color="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span
            className={`inline-block h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}
            title={wsConnected ? 'اتصال زنده برقرار است' : 'اتصال زنده برقرار نیست — به‌روزرسانی دوره‌ای'}
          />
          <span>{wsConnected ? 'به‌روزرسانی زنده فعال' : 'به‌روزرسانی دوره‌ای (۱۰ ثانیه)'}</span>
          {lastUpdate && <span>• آخرین به‌روزرسانی: {timeAgo(lastUpdate.toISOString())}</span>}
        </div>
      </div>

      {/* کارت دستگاه‌ها */}
      {devices.length === 0 ? (
        <Card>
          <EmptyState
            message="هنوز دستگاهی ثبت نشده است. از بخش «دستگاه‌ها» یک باکس آسانسور اضافه کنید."
            icon={<MonitorSmartphone size={32} />}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device: d }: { device: Device }) {
  const online = d.status === 'online';
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              online ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            <MonitorSmartphone size={20} />
          </div>
          <div>
            <p className="font-semibold text-slate-100">{d.name}</p>
            <p className="text-xs text-slate-500">{d.model ?? 'مدل نامشخص'}</p>
          </div>
        </div>
        <Badge
          label={online ? 'آنلاین' : 'آفلاین'}
          color={online ? deviceStatusColor.online : deviceStatusColor.offline}
        />
      </div>

      <div className="mt-3 space-y-2 text-sm">
        {/* نسخه فعال / آخرین وضعیت گزارش‌شده */}
        {online ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">نسخه فعال</span>
            <span className="font-medium text-slate-200">{d.active_version_no ? `نسخه ${d.active_version_no}` : '—'}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">آخرین وضعیت گزارش‌شده</span>
            <span className="text-xs text-slate-400">
              {d.active_version_no ? `نسخه ${d.active_version_no}` : '—'}
            </span>
          </div>
        )}

        {/* آیتم در حال نمایش */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500">آیتم در حال نمایش</span>
          <span className="flex items-center gap-1 text-slate-200" title={d.playing_item ?? ''}>
            {online && d.playing_item ? (
              <>
                <Radio size={14} className="text-cyan-400" />
                <span className="max-w-[180px] truncate">{d.playing_item}</span>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>

        {/* درصد دانلود */}
        {d.download_version_id && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 text-cyan-300">
                <Download size={13} />
                در حال دریافت نسخه
              </span>
              <span className="font-medium text-cyan-300">{d.download_progress ?? 0}٪</span>
            </div>
            <ProgressBar value={d.download_progress ?? 0} />
          </div>
        )}

        {/* خطای آخر */}
        {d.last_error && (
          <p className="flex items-start gap-1 rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {d.last_error}
          </p>
        )}

        {/* آخرین ارتباط */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-2 text-xs">
          <span className="flex items-center gap-1 text-slate-500">
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            آخرین ارتباط
          </span>
          <span className="text-slate-400">{timeAgo(d.last_seen_at)}</span>
        </div>
      </div>

      {d.is_blocked && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">دسترسی این دستگاه قطع شده است</p>
      )}
      {d.status !== 'online' && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-600">
          <Activity size={12} />
          وضعیت‌های انتشار: {d.download_version_id ? deploymentStatusLabel.downloading : 'بدون دریافت فعال'}
        </p>
      )}
    </Card>
  );
}
