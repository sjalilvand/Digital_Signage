import { useCallback, useEffect, useState } from 'react';
import { PlayCircle, ScrollText } from 'lucide-react';
import { extractError, reportsApi } from '../api';
import {
  Badge, EmptyState, Pagination, PageLoader, Select, Table, ToastHost, Card,
} from '../components/ui';
import { toast } from '../store/toast';
import { formatDateTime, secondsToHuman } from '../labels';
import type { AuditReport, PaginatedResponse, PlaybackReport } from '../types';

type Tab = 'playback' | 'audit';

export default function Reports() {
  const [tab, setTab] = useState<Tab>('playback');

  return (
    <div className="space-y-4">
      <ToastHost />
      <div className="flex gap-2">
        <TabButton active={tab === 'playback'} onClick={() => setTab('playback')} icon={<PlayCircle size={16} />}>
          گزارش پخش
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={<ScrollText size={16} />}>
          گزارش حسابرسی
        </TabButton>
      </div>

      {tab === 'playback' ? <PlaybackTab /> : <AuditTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ================================================================ گزارش پخش
function PlaybackTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<PlaybackReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [fDevice, setFDevice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.playback({ device: fDevice || undefined, page });
      setData(res.data);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [fDevice, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <h3 className="text-sm font-semibold text-slate-200">گزارش پخش آیتم‌ها</h3>
        <div className="ms-auto w-56">
          <Select value={fDevice} onChange={(e) => { setPage(1); setFDevice(e.target.value); }}>
            <option value="">همه دستگاه‌ها (شناسه)</option>
            <option value="all">فیلتر از لیست دستگاه‌ها در سرور</option>
          </Select>
        </div>
      </div>

      {loading && !data ? (
        <PageLoader message="در حال دریافت گزارش…" />
      ) : !data || data.results.length === 0 ? (
        <EmptyState message="گزارشی برای نمایش وجود ندارد." />
      ) : (
        <>
          <Table head={['دستگاه', 'محتوا', 'نسخه', 'شروع', 'مدت', 'کامل‌شده', 'خطا']}>
            {data.results.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/60">
                <td className="px-4 py-3 text-slate-200">{r.device_name ?? r.device_id}</td>
                <td className="px-4 py-3 text-slate-300">{r.content_name ?? r.content_id}</td>
                <td className="px-4 py-3 text-slate-400">{r.version_no ? `نسخه ${r.version_no}` : '—'}</td>
                <td className="px-4 py-3 text-slate-400">{formatDateTime(r.started_at)}</td>
                <td className="px-4 py-3 text-slate-400">{secondsToHuman(r.duration_sec)}</td>
                <td className="px-4 py-3">
                  <Badge
                    label={r.completed ? 'کامل' : 'ناقص'}
                    color={r.completed ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}
                  />
                </td>
                <td className="px-4 py-3 text-xs text-red-300">{r.error ?? '—'}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={25} count={data.count} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

// ================================================================ گزارش حسابرسی
function AuditTab() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse<AuditReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsApi.audit({ page });
      setData(res.data);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-200">گزارش حسابرسی (اقدامات کاربران)</h3>
      {loading && !data ? (
        <PageLoader message="در حال دریافت گزارش…" />
      ) : !data || data.results.length === 0 ? (
        <EmptyState message="گزارشی برای نمایش وجود ندارد." />
      ) : (
        <>
          <Table head={['کاربر', 'عملیات', 'شیء', 'جزئیات', 'تاریخ']}>
            {data.results.map((r) => {
              const detailStr = r.details ? JSON.stringify(r.details, null, 2) : '—';
              const isOpen = expanded === r.id;
              return (
                <tr key={r.id} className="align-top hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-200">{r.user ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge label={r.action} color="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" />
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.object ?? '—'}</td>
                  <td className="max-w-[280px] px-4 py-3">
                    {r.details ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="w-full rounded-lg bg-slate-950 p-2 text-right text-left"
                      >
                        <pre
                          dir="ltr"
                          className={`overflow-x-auto text-[11px] leading-5 text-slate-400 ${isOpen ? '' : 'max-h-16 overflow-hidden'}`}
                        >
                          {detailStr}
                        </pre>
                        <span className="text-[11px] text-cyan-400">{isOpen ? 'بستن' : 'نمایش کامل'}</span>
                      </button>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                </tr>
              );
            })}
          </Table>
          <Pagination page={page} pageSize={25} count={data.count} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
