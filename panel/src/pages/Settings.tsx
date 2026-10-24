import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import { extractError, settingsApi } from '../api';
import { Button, Card, CardHeader, Field, Input, PageLoader, ToastHost } from '../components/ui';
import { toast } from '../store/toast';
import type { Settings as SettingsType } from '../types';

const FIELDS: { key: keyof SettingsType; label: string; hint: string }[] = [
  {
    key: 'online_threshold_sec',
    label: 'آستانه آنلاین (ثانیه)',
    hint: 'اگر آخرین ارتباط دستگاه بیشتر از این مقدار باشد، آفلاین در نظر گرفته می‌شود (پیش‌فرض ۶۰).',
  },
  {
    key: 'pdf_dpi',
    label: 'کیفیت رندر PDF (DPI)',
    hint: 'وضوح تصویر صفحات PDF هنگام آماده‌سازی (پیش‌فرض ۱۵۰).',
  },
  {
    key: 'pdf_jpeg_quality',
    label: 'کیفیت JPEG صفحات PDF (٪)',
    hint: 'کیفیت فشرده‌سازی تصاویر صفحات PDF (پیش‌فرض ۸۵).',
  },
  {
    key: 'max_upload_gb',
    label: 'حداکثر حجم بارگذاری (گیگابایت)',
    hint: 'سقف حجم هر فایل بارگذاری‌شده (پیش‌فرض ۲).',
  },
  {
    key: 'default_poll_interval_sec',
    label: 'بازه polling پیش‌فرض دستگاه (ثانیه)',
    hint: 'فاصله زمانی پیش‌فرض مراجعه باکس به سرور برای دریافت وضعیت (پیش‌فرض ۱۵).',
  },
];

export default function Settings() {
  const [values, setValues] = useState<SettingsType | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi
      .get()
      .then((r) => setValues(r.data))
      .catch((e) => toast.error(extractError(e)));
  }, []);

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const { data } = await settingsApi.update(values);
      setValues(data);
      toast.success('تنظیمات ذخیره شد');
    } catch (err) {
      toast.error(extractError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!values) return <PageLoader message="در حال دریافت تنظیمات…" />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ToastHost />
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <SettingsIcon size={18} className="text-emerald-400" />
              تنظیمات سامانه
            </span>
          }
        />
        <div className="space-y-4 p-4">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint}>
              <Input
                type="number"
                min={1}
                value={values[f.key] as number}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: Number(e.target.value) } as SettingsType)
                }
              />
            </Field>
          ))}

          <div className="border-t border-slate-800 pt-4">
            <Button onClick={save} loading={saving}>
              <Save size={16} />
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
