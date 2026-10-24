import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, ArrowUp, ArrowDown, Trash2, Pencil, ListVideo, Info, Check,
} from 'lucide-react';
import { contentsApi, extractError, playlistsApi } from '../api';
import {
  Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal,
  PageLoader, Select, Textarea, ToastHost,
} from '../components/ui';
import { toast } from '../store/toast';
import {
  contentTypeLabel, fitModeLabel, humanSize, secondsToHuman,
} from '../labels';
import type { Content, ContentType, FitMode, Playlist, PlaylistItemInput } from '../types';

/** آیتم در حال ساخت — با شناسه موقت */
interface DraftItem extends PlaylistItemInput {
  key: string;
  content_name: string;
  content_type: ContentType;
  content_pdf_pages: number | null;
  content_duration: number | null;
}

let keySeq = 1;
const nextKey = () => `k${keySeq++}`;

export default function Playlists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderId, setBuilderId] = useState<string | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Playlist | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await playlistsApi.list();
      setPlaylists(Array.isArray(data) ? data : data.results ?? []);
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await playlistsApi.remove(deleteTarget.id);
      toast.success('برنامه نمایش حذف شد');
      setDeleteTarget(null);
      fetchList();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (builderId !== null) {
    return (
      <>
        <ToastHost />
        <PlaylistBuilder
          playlistId={builderId === 'new' ? null : builderId}
          onBack={() => { setBuilderId(null); fetchList(); }}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <ToastHost />
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          برنامه نمایش، فهرست ترتیبی آیتم‌های پخش است. پس از ساخت برنامه، از بخش «انتشار» آن را روی دستگاه‌ها منتشر کنید.
        </p>
        <Button onClick={() => setBuilderId('new')}>
          <Plus size={16} />
          برنامه جدید
        </Button>
      </div>

      {loading && playlists.length === 0 ? (
        <PageLoader message="در حال دریافت برنامه‌ها…" />
      ) : playlists.length === 0 ? (
        <Card>
          <EmptyState message="هنوز برنامه نمایشی ساخته نشده است." icon={<ListVideo size={32} />} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {playlists.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">{p.name}</p>
                  {p.description && <p className="mt-0.5 text-xs text-slate-500">{p.description}</p>}
                </div>
                <Badge label={`${p.items?.length ?? 0} آیتم`} color="bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" />
              </div>

              {p.items?.length > 0 && (
                <ol className="mt-3 space-y-1 border-t border-slate-800 pt-3 text-xs text-slate-400">
                  {p.items.slice(0, 4).map((it) => (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{it.order}. {it.content_name}</span>
                      <span className="shrink-0 text-slate-600">{secondsToHuman(it.duration_sec)}</span>
                    </li>
                  ))}
                  {p.items.length > 4 && <li className="text-slate-600">… و {p.items.length - 4} آیتم دیگر</li>}
                </ol>
              )}

              <div className="mt-3 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setBuilderId(p.id)}>
                  <Pencil size={14} />
                  ویرایش / ساخت
                </Button>
                <Button variant="ghost" className="text-red-400" onClick={() => setDeleteTarget(p)}>
                  <Trash2 size={14} />
                  حذف
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="حذف برنامه نمایش"
        message={`آیا از حذف «${deleteTarget?.name}» مطمئن هستید؟`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ================================================================ سازنده برنامه
function PlaylistBuilder({ playlistId, onBack }: { playlistId: string | null; onBack: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(!!playlistId);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<DraftItem | null>(null);

  useEffect(() => {
    if (!playlistId) return;
    playlistsApi
      .get(playlistId)
      .then(({ data }) => {
        setName(data.name);
        setDescription(data.description);
        setItems(
          (data.items ?? []).map((it) => ({
            key: nextKey(),
            content_id: it.content_id,
            content_name: it.content_name,
            content_type: 'video' as ContentType, // نوع دقیقاً هنگام ویرایش از محتوا دریافت می‌شود
            content_pdf_pages: null,
            content_duration: null,
            duration_sec: it.duration_sec,
            mute: it.mute,
            volume: it.volume,
            fit_mode: it.fit_mode,
            background_color: it.background_color,
            pdf_pages: it.pdf_pages,
            pdf_seconds_per_page: it.pdf_seconds_per_page,
            repeat_count: it.repeat_count,
            audio_bg_content_id: it.audio_bg_content_id,
          })),
        );
      })
      .catch((e) => toast.error(extractError(e)))
      .finally(() => setLoading(false));
  }, [playlistId]);

  const addItem = (c: Content) => {
    setItems((prev) => [
      ...prev,
      {
        key: nextKey(),
        content_id: c.id,
        content_name: c.name,
        content_type: c.type,
        content_pdf_pages: c.pdf_pages,
        content_duration: c.duration_sec,
        duration_sec: c.type === 'video' || c.type === 'audio' ? null : c.type === 'pdf' ? null : 10,
        mute: false,
        volume: c.type === 'video' || c.type === 'audio' ? 80 : 0,
        fit_mode: 'contain',
        background_color: '#000000',
        pdf_pages: null,
        pdf_seconds_per_page: c.type === 'pdf' ? 10 : 10,
        repeat_count: null,
        audio_bg_content_id: null,
      },
    ]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const removeAt = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!name.trim()) {
      toast.error('نام برنامه را وارد کنید');
      return;
    }
    if (items.length === 0) {
      toast.error('حداقل یک آیتم به برنامه اضافه کنید');
      return;
    }
    setSaving(true);
    try {
      const payload: PlaylistItemInput[] = items.map((it) => ({
        content_id: it.content_id,
        duration_sec: it.duration_sec,
        mute: it.mute,
        volume: it.volume,
        fit_mode: it.fit_mode,
        background_color: it.background_color,
        pdf_pages: it.pdf_pages,
        pdf_seconds_per_page: it.pdf_seconds_per_page,
        repeat_count: it.repeat_count,
        audio_bg_content_id: it.audio_bg_content_id,
      }));
      let pid = playlistId;
      if (!pid) {
        const { data } = await playlistsApi.create({ name, description });
        pid = data.id;
      } else {
        await playlistsApi.update(pid, { name, description });
      }
      await playlistsApi.setItems(pid, payload);
      toast.success('برنامه نمایش ذخیره شد');
      onBack();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader message="در حال دریافت برنامه…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ToastHost />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-100">{playlistId ? 'ویرایش برنامه نمایش' : 'برنامه نمایش جدید'}</h2>
        <Button variant="secondary" onClick={onBack}>بازگشت به فهرست</Button>
      </div>

      <Card className="space-y-3 p-4">
        <Field label="نام برنامه">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً اطلاع‌رسانی آسانسورها" />
        </Field>
        <Field label="توضیحات (اختیاری)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </Card>

      {/* آیتم‌ها */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-100">فهرست پخش ({items.length} آیتم)</h3>
          <Button onClick={() => setPickerOpen(true)}>
            <Plus size={15} />
            افزودن آیتم
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState message="هنوز آیتمی اضافه نشده است." icon={<ListVideo size={28} />} />
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => (
              <li key={it.key} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{it.content_name}</p>
                  <p className="text-[11px] text-slate-500">
                    {contentTypeLabel[it.content_type]} • {secondsToHuman(it.duration_sec)}
                    {it.repeat_count && it.repeat_count > 1 ? ` • تکرار ${it.repeat_count} بار` : ''}
                    {it.pdf_pages ? ` • صفحات ${it.pdf_pages.join('،')}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" aria-label="انتقال به بالا">
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" aria-label="انتقال به پایین">
                    <ArrowDown size={15} />
                  </button>
                  <button type="button" onClick={() => setEditing(it)}
                    className="rounded p-1.5 text-cyan-400 hover:bg-slate-800" aria-label="تنظیمات آیتم">
                    <Pencil size={15} />
                  </button>
                  <button type="button" onClick={() => removeAt(idx)}
                    className="rounded p-1.5 text-red-400 hover:bg-slate-800" aria-label="حذف آیتم">
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* نمونه پیشنهادی مطابق SRS */}
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs leading-5 text-slate-400">
          <Info size={14} className="mt-0.5 shrink-0 text-cyan-400" />
          <span>
            <b className="text-slate-300">نمونه:</b> ۱) فیلم معرفی — پخش تا پایان؛ ۲) تصویر اطلاعیه — ۳۰ ثانیه، حفظ نسبت؛
            ۳) پیام متنی خوش‌آمدگویی — تکرار ۲ بار؛ ۴) PDF آیین‌نامه — صفحات ۱ و ۲، هر صفحه ۱۰ ثانیه.
          </span>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} loading={saving}>
          <Check size={16} />
          ذخیره برنامه
        </Button>
        <Button variant="secondary" onClick={onBack}>انصراف</Button>
      </div>

      <ContentPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(c) => { addItem(c); setPickerOpen(false); }}
      />

      {editing && (
        <ItemSettingsModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            setItems((prev) => prev.map((x) => (x.key === updated.key ? updated : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ================================================================ انتخاب محتوا
function ContentPickerModal({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (c: Content) => void }) {
  const [typeFilter, setTypeFilter] = useState('');
  const [list, setList] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    contentsApi
      .list({ status: 'ready', type: typeFilter || undefined, page_size: 50 })
      .then((r) => {
        const d = r.data;
        setList(Array.isArray(d) ? d : d.results ?? []);
      })
      .catch((e) => toast.error(extractError(e)))
      .finally(() => setLoading(false));
  }, [open, typeFilter]);

  return (
    <Modal open={open} onClose={onClose} title="افزودن آیتم — انتخاب محتوای آماده" wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
            <option value="">همه انواع</option>
            {Object.entries(contentTypeLabel).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <p className="text-xs text-slate-500">فقط محتواهای «آماده انتشار» نمایش داده می‌شوند.</p>
        </div>

        {loading ? (
          <PageLoader message="در حال دریافت محتواها…" />
        ) : list.length === 0 ? (
          <EmptyState message="محتوای آماده‌ای با این نوع وجود ندارد." />
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-right hover:border-emerald-500/50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-slate-200">{c.name}</span>
                    <span className="text-[11px] text-slate-500">
                      {contentTypeLabel[c.type]}
                      {c.duration_sec != null ? ` • ${secondsToHuman(c.duration_sec)}` : ''}
                      {c.pdf_pages != null ? ` • ${c.pdf_pages} صفحه` : ''}
                      {` • ${humanSize(c.size_bytes)}`}
                    </span>
                  </span>
                  <Plus size={16} className="shrink-0 text-emerald-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ================================================================ تنظیمات آیتم
function ItemSettingsModal({
  item, onClose, onSave,
}: { item: DraftItem; onClose: () => void; onSave: (it: DraftItem) => void }) {
  const [draft, setDraft] = useState<DraftItem>({ ...item });
  const isMedia = draft.content_type === 'video' || draft.content_type === 'audio';
  const isPdf = draft.content_type === 'pdf';
  const isVisual = draft.content_type === 'video' || draft.content_type === 'image' || draft.content_type === 'html';

  const set = (patch: Partial<DraftItem>) => setDraft((d) => ({ ...d, ...patch }));

  // صفحات PDF انتخاب‌شده به‌صورت ورودی متنی «1،2،5»
  const pagesText = draft.pdf_pages ? draft.pdf_pages.join('،') : '';

  return (
    <Modal open onClose={onClose} title={`تنظیمات آیتم: ${item.content_name}`} wide>
      <div className="space-y-4">
        {/* مدت */}
        <div className="space-y-2">
          {isMedia ? (
            <Checkbox
              label="پخش تا پایان فایل"
              checked={draft.duration_sec === null}
              onChange={(v) => set({ duration_sec: v ? null : Math.ceil(item.content_duration ?? 10) })}
            />
          ) : null}
          <Field
            label="مدت نمایش (ثانیه)"
            hint={isMedia && draft.duration_sec === null ? 'فایل تا پایان خودش پخش می‌شود' : undefined}
          >
            <Input
              type="number"
              min={1}
              value={draft.duration_sec ?? ''}
              disabled={isMedia && draft.duration_sec === null}
              onChange={(e) => set({ duration_sec: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
        </div>

        {/* صدا */}
        {isMedia && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="بی‌صدا (mute)" checked={draft.mute} onChange={(v) => set({ mute: v })} />
            <Field label={`بلندی صدا: ${draft.volume}٪`}>
              <input
                type="range"
                min={0}
                max={100}
                value={draft.volume}
                disabled={draft.mute}
                onChange={(e) => set({ volume: Number(e.target.value) })}
                className="w-full accent-emerald-500 disabled:opacity-40"
              />
            </Field>
          </div>
        )}

        {/* نمایش تصویری */}
        {isVisual && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="حالت نمایش">
              <Select value={draft.fit_mode} onChange={(e) => set({ fit_mode: e.target.value as FitMode })}>
                {Object.entries(fitModeLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Field>
            <Field label="رنگ پس‌زمینه">
              <Input
                type="color"
                value={draft.background_color}
                onChange={(e) => set({ background_color: e.target.value })}
                className="h-10"
              />
            </Field>
          </div>
        )}

        {/* PDF */}
        {isPdf && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={`صفحات (خالی = همه ${item.content_pdf_pages ?? '?'} صفحه)`}
              hint="شماره صفحات را با ویرگول جدا کنید، مثلاً: 1،2،5"
            >
              <Input
                value={pagesText}
                onChange={(e) => {
                  const arr = e.target.value
                    .split(/[،,]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map(Number)
                    .filter((n) => Number.isFinite(n) && n > 0);
                  set({ pdf_pages: arr.length ? arr : null });
                }}
                dir="ltr"
              />
            </Field>
            <Field label="ثانیه برای هر صفحه">
              <Input
                type="number"
                min={1}
                value={draft.pdf_seconds_per_page}
                onChange={(e) => set({ pdf_seconds_per_page: Number(e.target.value) || 10 })}
              />
            </Field>
          </div>
        )}

        {/* تکرار */}
        <Field label="تعداد تکرار (خالی = طبق چرخه عادی)" hint="آیتم قبل از رفتن به آیتم بعدی چند بار پخش شود">
          <Input
            type="number"
            min={1}
            value={draft.repeat_count ?? ''}
            onChange={(e) => set({ repeat_count: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>

        <div className="flex gap-2">
          <Button onClick={() => onSave(draft)}>ذخیره تنظیمات</Button>
          <Button variant="secondary" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Modal>
  );
}
