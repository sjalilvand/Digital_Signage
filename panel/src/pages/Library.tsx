import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Film, Music, Image as ImageIcon, FileText, Code2, Type, UploadCloud, Eye, Pencil,
  RefreshCw, Trash2, Info, Search, X,
} from 'lucide-react';
import { contentsApi, extractError } from '../api';
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Pagination,
  PageLoader, ProgressBar, Select, TagChip, Textarea, ToastHost,
} from '../components/ui';
import { toast } from '../store/toast';
import { contentTypeLabel, contentStatusColor, contentStatusLabel, detectType, formatDateTime, humanSize } from '../labels';
import type { Content, ContentStatus, ContentUsage, ContentType, RenderedAsset, TextData } from '../types';

const PAGE_SIZE = 12;
const POLL_MS = 2000;
const POLL_MAX_MS = 5 * 60 * 1000;

const typeIcon: Record<ContentType, React.ReactNode> = {
  video: <Film size={28} className="text-cyan-400" />,
  audio: <Music size={28} className="text-emerald-400" />,
  image: <ImageIcon size={28} className="text-indigo-400" />,
  pdf: <FileText size={28} className="text-red-400" />,
  html: <Code2 size={28} className="text-amber-400" />,
  text: <Type size={28} className="text-slate-300" />,
};

/** آپلود را تا رسیدن به وضعیت ready/failed پیگیری می‌کند (حداکثر ۵ دقیقه) */
async function pollUntilReady(id: string): Promise<Content> {
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const { data } = await contentsApi.get(id);
      if (data.status === 'ready' || data.status === 'failed') return data;
    } catch {
      /* تلاش مجدد */
    }
  }
  throw new Error('مهلت آماده‌سازی محتوا به پایان رسید');
}

export default function Library() {
  const [items, setItems] = useState<Content[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // فیلترها
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fSearch, setFSearch] = useState('');
  const [fTag, setFTag] = useState('');

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await contentsApi.list({
        type: fType || undefined,
        status: fStatus || undefined,
        search: fSearch || undefined,
        tag: fTag || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      const arr: Content[] = Array.isArray(data) ? data : (data.results ?? []);
      setItems(arr);
      setCount(Array.isArray(data) ? arr.length : (data.count ?? 0));
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setLoading(false);
    }
  }, [fType, fStatus, fSearch, fTag, page]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="space-y-4">
      <ToastHost />

      {/* فیلترها */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="جستجو در نام و توضیحات…"
            value={fSearch}
            onChange={(e) => { setPage(1); setFSearch(e.target.value); }}
            className="pr-9"
          />
        </div>
        <Select value={fType} onChange={(e) => { setPage(1); setFType(e.target.value); }} className="w-36">
          <option value="">همه انواع</option>
          {Object.entries(contentTypeLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Select value={fStatus} onChange={(e) => { setPage(1); setFStatus(e.target.value); }} className="w-52">
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(contentStatusLabel).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <div className="relative">
          <Input
            placeholder="فیلتر برچسب…"
            value={fTag}
            onChange={(e) => { setPage(1); setFTag(e.target.value); }}
            className="w-40"
          />
          {fTag && (
            <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              onClick={() => { setPage(1); setFTag(''); }} aria-label="پاک کردن برچسب">
              <X size={14} />
            </button>
          )}
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <UploadCloud size={16} />
          بارگذاری محتوای جدید
        </Button>
      </div>

      {/* شبکه کارت‌ها */}
      {loading && items.length === 0 ? (
        <PageLoader message="در حال دریافت کتابخانه…" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState message="محتوایی یافت نشد. اولین محتوای خود را بارگذاری کنید." icon={<Film size={32} />} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {items.map((c) => (
            <ContentCard key={c.id} content={c} onChanged={fetchList} />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} count={count} onChange={setPage} />

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onDone={() => { setUploadOpen(false); fetchList(); }}
      />
    </div>
  );
}

// ================================================================ کارت محتوا
function ContentCard({ content: c, onChanged }: { content: Content; onChanged: () => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await contentsApi.remove(c.id);
      toast.success('محتوا حذف شد');
      setDeleteOpen(false);
      onChanged();
    } catch (err) {
      const msg = extractError(err);
      toast.error(
        msg.includes('409') || msg.includes('درحال‌استفاده') || msg.includes('در حال استفاده')
          ? 'این محتوا در برنامه نمایش فعال استفاده شده است و قابل حذف نیست.'
          : msg,
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="flex flex-col overflow-hidden">
      {/* تصویر بندانگشتی */}
      <div className="flex h-32 items-center justify-center border-b border-slate-800 bg-slate-950">
        {c.thumbnail_url ? (
          <img
            src={c.thumbnail_url}
            alt={c.name}
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          typeIcon[c.type]
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-100" title={c.name}>{c.name}</p>
          <Badge label={contentTypeLabel[c.type] ?? c.type} color="bg-slate-800 text-slate-300" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <span>{humanSize(c.size_bytes)}</span>
          {c.duration_sec != null && <span>• {Math.round(c.duration_sec)} ثانیه</span>}
          {c.pdf_pages != null && <span>• {c.pdf_pages} صفحه</span>}
          <span>• {formatDateTime(c.created_at)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Badge label={contentStatusLabel[c.status] ?? c.status} color={contentStatusColor[c.status]} />
          {c.tags?.map((t) => <TagChip key={t} label={t} />)}
        </div>

        {c.status === 'failed' && c.error_message && (
          <p className="rounded bg-red-500/10 px-2 py-1 text-[11px] text-red-300">{c.error_message}</p>
        )}
        {c.status === 'processing' && (
          <p className="text-[11px] text-amber-300">در حال بررسی و آماده‌سازی…</p>
        )}

        <div className="mt-auto grid grid-cols-3 gap-1 pt-2">
          <Button variant="secondary" onClick={() => setPreviewOpen(true)} title="پیش‌نمایش" className="px-2 py-1.5 text-xs">
            <Eye size={14} />
            پیش‌نمایش
          </Button>
          <Button variant="secondary" onClick={() => setEditOpen(true)} title="ویرایش" className="px-2 py-1.5 text-xs">
            <Pencil size={14} />
            ویرایش
          </Button>
          <Button variant="secondary" onClick={() => setReplaceOpen(true)} title="جایگزینی" className="px-2 py-1.5 text-xs">
            <RefreshCw size={14} />
            جایگزینی
          </Button>
          <Button variant="ghost" onClick={() => setUsageOpen(true)} className="px-2 py-1.5 text-xs">
            استفاده
          </Button>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="col-span-2 px-2 py-1.5 text-xs text-red-400 hover:text-red-300">
            <Trash2 size={14} />
            حذف
          </Button>
        </div>
      </div>

      <PreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} content={c} />
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} content={c} onSaved={onChanged} />
      <ReplaceModal open={replaceOpen} onClose={() => setReplaceOpen(false)} content={c} onDone={onChanged} />
      <UsageModal open={usageOpen} onClose={() => setUsageOpen(false)} content={c} />

      <ConfirmDialog
        open={deleteOpen}
        title="حذف محتوا"
        message={`آیا از حذف «${c.name}» مطمئن هستید؟ این عملیات بازگشت‌پذیر نیست.`}
        confirmLabel="حذف"
        danger
        loading={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </Card>
  );
}

// ================================================================ پیش‌نمایش
function PreviewModal({ open, onClose, content: c }: { open: boolean; onClose: () => void; content: Content }) {
  const [assets, setAssets] = useState<RenderedAsset[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setAssets(null);
    setErr('');
    if (c.type === 'pdf') {
      contentsApi
        .assets(c.id)
        .then((r) => setAssets(r.data))
        .catch((e) => setErr(extractError(e)));
    }
  }, [open, c]);

  const url = c.original_url ?? '';

  return (
    <Modal open={open} onClose={onClose} title={`پیش‌نمایش: ${c.name}`} wide>
      {err && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}

      {c.type === 'image' && (c.thumbnail_url || url) && (
        <img src={url || (c.thumbnail_url ?? '')} alt={c.name} className="max-h-[60vh] w-full rounded-lg object-contain" />
      )}

      {c.type === 'video' && url && (
        <video src={url} controls className="max-h-[60vh] w-full rounded-lg bg-black" />
      )}

      {c.type === 'audio' && url && (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-center rounded-lg bg-slate-950 py-8">
            <Music size={48} className="text-emerald-400" />
          </div>
          <audio src={url} controls className="w-full" />
        </div>
      )}

      {c.type === 'pdf' && (
        assets && assets.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {assets
              .slice()
              .sort((a, b) => (a.page_number ?? 0) - (b.page_number ?? 0))
              .map((a) => (
                <div key={a.id} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                  <img src={a.url} alt={`صفحه ${a.page_number}`} className="h-40 w-full object-cover" />
                  <p className="py-1 text-center text-xs text-slate-400">صفحه {a.page_number}</p>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {err ? 'خطا در دریافت صفحات' : 'در حال دریافت صفحات PDF…'}
          </p>
        )
      )}

      {c.type === 'text' && c.text_data && (
        <div
          className="rounded-lg p-6"
          style={{ backgroundColor: c.text_data.bg_color || '#000000', color: c.text_data.fg_color || '#ffffff' }}
        >
          {c.text_data.title && <h4 className="mb-2 text-xl font-bold">{c.text_data.title}</h4>}
          <p className="whitespace-pre-wrap leading-8">{c.text_data.body}</p>
          {c.text_data.image_url && <img src={c.text_data.image_url} alt="" className="mt-3 max-h-64 w-full object-contain" />}
        </div>
      )}

      {c.type === 'html' && (
        <p className="text-sm text-slate-400">
          محتوای HTML در دستگاه به‌صورت بسته کامل (zip با نقطه ورود «{c.html_entry ?? 'index.html'}») پخش می‌شود؛
          پیش‌نمایش درون پنل برای این نوع ارائه نمی‌شود.
        </p>
      )}

      {c.status !== 'ready' && (
        <p className="mt-3 flex items-center gap-1 text-xs text-amber-300">
          <Info size={13} />
          وضعیت فعلی: {contentStatusLabel[c.status] ?? c.status}
        </p>
      )}
    </Modal>
  );
}

// ================================================================ ویرایش
function EditModal({ open, onClose, content: c, onSaved }: { open: boolean; onClose: () => void; content: Content; onSaved: () => void }) {
  const [name, setName] = useState(c.name);
  const [description, setDescription] = useState(c.description);
  const [tags, setTags] = useState(c.tags.join('، '));
  const [expiry, setExpiry] = useState(c.expiry_date ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(c.name);
      setDescription(c.description);
      setTags(c.tags.join('، '));
      setExpiry(c.expiry_date ?? '');
    }
  }, [open, c]);

  const save = async () => {
    setSaving(true);
    try {
      await contentsApi.update(c.id, {
        name,
        description,
        tags: tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean),
        expiry_date: expiry || null,
      });
      toast.success('تغییرات ذخیره شد');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`ویرایش: ${c.name}`}>
      <div className="space-y-3">
        <Field label="نام محتوا">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="توضیحات">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="برچسب‌ها (با ویرگول جدا کنید)">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="اطلاعیه، مناسبت" />
        </Field>
        <Field label="تاریخ انقضا" hint="پس از انقضا، محتوا در پخش استفاده نمی‌شود (اختیاری)">
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-1">
          <Button onClick={save} loading={saving}>ذخیره</Button>
          <Button variant="secondary" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================================================================ جایگزینی
function ReplaceModal({ open, onClose, content: c, onDone }: { open: boolean; onClose: () => void; content: Content; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await contentsApi.replace(c.id, fd, setProgress);
      toast.success('فایل جدید بارگذاری شد؛ در حال آماده‌سازی…');
      // محتوای جایگزین تا ready/failed پیگیری می‌شود
      pollUntilReady(data.id)
        .then((ready) => {
          if (ready.status === 'ready') toast.success('جایگزینی محتوا آماده شد');
          else toast.error(`آماده‌سازی ناموفق: ${ready.error_message ?? ''}`);
          onDone();
        })
        .catch((e) => toast.error(extractError(e)));
      onClose();
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`جایگزینی فایل: ${c.name}`}>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          فایل جدید جایگزین فایل فعلی می‌شود؛ نسخه قبلی به‌عنوان «جایگزین‌شده» علامت می‌خورد.
          نوع فایل باید با نوع محتوا سازگار باشد.
        </p>
        <Field label="فایل جدید">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div
            className="cursor-pointer rounded-lg border-2 border-dashed border-slate-700 p-6 text-center hover:border-emerald-500/60"
            onClick={() => inputRef.current?.click()}
          >
            {file ? (
              <p className="text-sm text-slate-200">{file.name} ({humanSize(file.size)})</p>
            ) : (
              <p className="text-sm text-slate-500">برای انتخاب فایل کلیک کنید</p>
            )}
          </div>
        </Field>
        {busy && (
          <div className="space-y-1">
            <ProgressBar value={progress} />
            <p className="text-xs text-slate-500">{progress}٪ — در حال بارگذاری…</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={!file} loading={busy}>بارگذاری و جایگزینی</Button>
          <Button variant="secondary" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </Modal>
  );
}

// ================================================================ استفاده
function UsageModal({ open, onClose, content: c }: { open: boolean; onClose: () => void; content: Content }) {
  const [usage, setUsage] = useState<ContentUsage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    contentsApi
      .usage(c.id)
      .then((r) => setUsage(r.data))
      .catch((e) => toast.error(extractError(e)))
      .finally(() => setLoading(false));
  }, [open, c]);

  return (
    <Modal open={open} onClose={onClose} title={`محل استفاده: ${c.name}`}>
      {loading ? (
        <PageLoader message="در حال بررسی…" />
      ) : !usage ? (
        <EmptyState message="اطلاعاتی یافت نشد" />
      ) : (
        <div className="space-y-3 text-sm">
          <p>
            انتشارهای فعال: <span className="font-bold text-slate-100">{usage.active_deployments}</span>
          </p>
          {usage.playlists?.length ? (
            <div>
              <p className="mb-1 text-slate-400">برنامه‌های نمایش:</p>
              <ul className="list-inside list-disc space-y-1 text-slate-300">
                {usage.playlists.map((p) => (
                  <li key={p.id}>{p.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-slate-500">این محتوا در هیچ برنامه نمایشی استفاده نشده است.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ================================================================ بارگذاری
interface UploadState {
  phase: 'form' | 'uploading' | 'processing' | 'done';
  progress: number;
  contentId: string | null;
  error: string;
}

const emptyText: TextData = { title: '', body: '', bg_color: '#000000', fg_color: '#ffffff', image_url: null };

function UploadModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ContentType | ''>('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [expiry, setExpiry] = useState('');

  // فیلدهای محتوای متنی
  const [textData, setTextData] = useState<TextData>({ ...emptyText });

  const [st, setSt] = useState<UploadState>({ phase: 'form', progress: 0, contentId: null, error: '' });
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setName('');
    setType('');
    setDescription('');
    setTags('');
    setExpiry('');
    setTextData({ ...emptyText });
    setSt({ phase: 'form', progress: 0, contentId: null, error: '' });
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const pickFile = (f: File | null) => {
    setFile(f);
    if (!f) return;
    setName(name || f.name.replace(/\.[^.]+$/, ''));
    const detected = detectType(f.name);
    if (detected) setType(detected);
  };

  const submit = async () => {
    setSt({ phase: 'uploading', progress: 0, contentId: null, error: '' });
    const fd = new FormData();
    if (mode === 'file') {
      if (!file) {
        setSt({ phase: 'form', progress: 0, contentId: null, error: 'لطفاً یک فایل انتخاب کنید' });
        return;
      }
      fd.append('file', file);
    } else {
      if (!textData.body.trim()) {
        setSt({ phase: 'form', progress: 0, contentId: null, error: 'متن پیام را وارد کنید' });
        return;
      }
      fd.append('text_data', JSON.stringify(textData));
    }
    fd.append('name', name || (file?.name ?? 'محتوای متنی'));
    if (type) fd.append('type', type);
    fd.append('description', description);
    fd.append(
      'tags',
      JSON.stringify(tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean)),
    );
    if (expiry) fd.append('expiry_date', expiry);

    try {
      const { data } = await contentsApi.create(fd, (pct) =>
        setSt((s) => ({ ...s, phase: 'uploading', progress: pct })),
      );
      setSt((s) => ({ ...s, phase: 'processing', contentId: data.id, progress: 100 }));
      toast.info('بارگذاری انجام شد؛ در حال بررسی و آماده‌سازی…');
      const final = await pollUntilReady(data.id);
      if (final.status === 'ready') {
        toast.success('محتوا آماده انتشار شد');
        setSt((s) => ({ ...s, phase: 'done' }));
        onDone();
      } else {
        toast.error(`آماده‌سازی ناموفق بود: ${final.error_message ?? ''}`);
        setSt((s) => ({ ...s, phase: 'form', error: final.error_message ?? 'آماده‌سازی ناموفق' }));
      }
    } catch (err) {
      const msg = extractError(err);
      toast.error(msg);
      setSt((s) => ({ ...s, phase: 'form', error: msg }));
    }
  };

  const busy = st.phase === 'uploading' || st.phase === 'processing';

  return (
    <Modal open={open} onClose={onClose} title="بارگذاری محتوای جدید" wide>
      <div className="space-y-4">
        {/* انتخاب نوع ورودی */}
        <div className="flex gap-2">
          <Button variant={mode === 'file' ? 'primary' : 'secondary'} onClick={() => setMode('file')} disabled={busy}>
            فایل رسانه‌ای
          </Button>
          <Button variant={mode === 'text' ? 'primary' : 'secondary'} onClick={() => setMode('text')} disabled={busy}>
            پیام متنی
          </Button>
        </div>

        {mode === 'file' && (
          <>
            {/* کشیدن و رها کردن */}
            <div
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 hover:border-slate-500'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud size={36} className="mx-auto mb-2 text-slate-500" />
              {file ? (
                <p className="text-sm text-slate-200">
                  {file.name} <span className="text-slate-500">({humanSize(file.size)})</span>
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-400">فایل را اینجا بکشید یا برای انتخاب کلیک کنید</p>
                  <p className="mt-1 text-xs text-slate-600">mp4 / mp3 / m4a / aac / jpg / png / webp / pdf / zip / html — حداکثر ۲ گیگابایت</p>
                </>
              )}
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام محتوا">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
              </Field>
              <Field label="نوع" hint="از پسوند فایل تشخیص داده می‌شود">
                <Select value={type} onChange={(e) => setType(e.target.value as ContentType)} disabled={busy}>
                  <option value="">— انتخاب کنید —</option>
                  {Object.entries(contentTypeLabel).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {mode === 'text' && (
          <div className="space-y-3 rounded-xl border border-slate-800 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام محتوا">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="مثلاً اطلاعیه نذری" />
              </Field>
              <Field label="عنوان پیام">
                <Input value={textData.title} onChange={(e) => setTextData({ ...textData, title: e.target.value })} disabled={busy} />
              </Field>
            </div>
            <Field label="متن پیام">
              <Textarea rows={4} value={textData.body} onChange={(e) => setTextData({ ...textData, body: e.target.value })} disabled={busy} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="رنگ پس‌زمینه">
                <Input type="color" value={textData.bg_color} onChange={(e) => setTextData({ ...textData, bg_color: e.target.value })} className="h-10" />
              </Field>
              <Field label="رنگ متن">
                <Input type="color" value={textData.fg_color} onChange={(e) => setTextData({ ...textData, fg_color: e.target.value })} className="h-10" />
              </Field>
            </div>
            <Field label="تصویر اختیاری (URL)">
              <Input value={textData.image_url ?? ''} onChange={(e) => setTextData({ ...textData, image_url: e.target.value })} disabled={busy} dir="ltr" />
            </Field>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="برچسب‌ها (با ویرگول جدا کنید)">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} placeholder="اطلاعیه، مناسبت" />
          </Field>
          <Field label="تاریخ انقضا (اختیاری)">
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} disabled={busy} />
          </Field>
        </div>
        <Field label="توضیحات (اختیاری)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
        </Field>

        {/* پیشرفت */}
        {st.phase === 'uploading' && (
          <div className="space-y-1">
            <ProgressBar value={st.progress} />
            <p className="text-xs text-cyan-300">در حال بارگذاری… {st.progress}٪</p>
          </div>
        )}
        {st.phase === 'processing' && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            در حال بررسی و آماده‌سازی محتوا — تا آماده شدن این پنجره را نبندید (حداکثر ۵ دقیقه)
          </div>
        )}
        {st.error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{st.error}</p>
        )}

        {/* راهنما: بارگذاری ≠ انتشار */}
        <p className="flex items-start gap-2 rounded-lg bg-cyan-500/10 px-3 py-2 text-xs leading-5 text-cyan-300">
          <Info size={14} className="mt-0.5 shrink-0" />
          بارگذاری ≠ انتشار؛ پس از بارگذاری، برنامه نمایش بسازید و منتشر کنید.
        </p>

        <div className="flex gap-2">
          <Button onClick={submit} loading={busy} disabled={st.phase === 'done'}>
            {st.phase === 'done' ? 'انجام شد' : 'بارگذاری'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {st.phase === 'done' ? 'بستن' : 'انصراف'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
