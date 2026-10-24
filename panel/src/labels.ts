import dayjs from 'dayjs';

// ------------------------------------------------ زمان
/** «X دقیقه پیش» — زمان نسبی فارسی */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'هرگز';
  const d = dayjs(iso);
  if (!d.isValid()) return '—';
  const diffSec = Math.max(0, dayjs().diff(d, 'second'));
  if (diffSec < 10) return 'همین حالا';
  if (diffSec < 60) return `${diffSec} ثانیه پیش`;
  const diffMin = dayjs().diff(d, 'minute');
  if (diffMin < 60) return `${diffMin} دقیقه پیش`;
  const diffH = dayjs().diff(d, 'hour');
  if (diffH < 24) return `${diffH} ساعت پیش`;
  const diffD = dayjs().diff(d, 'day');
  if (diffD < 30) return `${diffD} روز پیش`;
  return d.format('YYYY/MM/DD HH:mm');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY/MM/DD - HH:mm') : '—';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY/MM/DD') : '—';
}

export function secondsToHuman(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return 'تا پایان';
  if (sec < 60) return `${Math.round(sec)} ثانیه`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s ? `${m} دقیقه و ${s} ثانیه` : `${m} دقیقه`;
}

// ------------------------------------------------ اندازه فایل
export function humanSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ------------------------------------------------ برچسب‌ها
export const contentTypeLabel: Record<string, string> = {
  video: 'فیلم',
  audio: 'صوت',
  image: 'تصویر',
  pdf: 'PDF',
  html: 'HTML',
  text: 'متن',
};

export const contentStatusLabel: Record<string, string> = {
  uploaded: 'بارگذاری‌شده',
  processing: 'در حال بررسی و آماده‌سازی',
  ready: 'آماده انتشار',
  failed: 'ناموفق',
};

export const contentStatusColor: Record<string, string> = {
  uploaded: 'bg-slate-700 text-slate-200',
  processing: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  ready: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

export const deploymentStatusLabel: Record<string, string> = {
  pending_connection: 'در انتظار ارتباط',
  downloading: 'در حال دریافت',
  ready: 'آماده',
  active: 'فعال',
  playing: 'در حال نمایش',
  failed: 'ناموفق',
  cancelled: 'لغوشده',
  replaced: 'جایگزین‌شده',
};

export const deploymentStatusColor: Record<string, string> = {
  pending_connection: 'bg-slate-500/20 text-slate-300 border border-slate-400/30',
  downloading: 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30',
  ready: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  active: 'bg-emerald-600/25 text-emerald-300 border border-emerald-400/40',
  playing: 'bg-cyan-600/25 text-cyan-200 border border-cyan-400/40',
  failed: 'bg-red-500/20 text-red-300 border border-red-500/30',
  cancelled: 'bg-slate-700 text-slate-400',
  replaced: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
};

export const deviceStatusLabel: Record<string, string> = {
  online: 'آنلاین',
  offline: 'آفلاین',
};

export const deviceStatusColor: Record<string, string> = {
  online: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  offline: 'bg-red-500/20 text-red-300 border border-red-500/30',
};

export const scheduleTypeLabel: Record<string, string> = {
  immediate: 'فوری',
  scheduled: 'زمان‌دار',
  recurring: 'دوره‌ای',
  expiry: 'با پایان اعتبار',
};

export const recurrenceLabel: Record<string, string> = {
  none: 'بدون تکرار',
  daily: 'روزانه',
  weekly: 'هفتگی',
};

/** 0=شنبه … 6=جمعه */
export const daysOfWeekLabel: string[] = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

export const fitModeLabel: Record<string, string> = {
  contain: 'حفظ نسبت',
  cover: 'پرکردن',
  stretch: 'کشیدگی',
};

export function scheduleSummary(s: {
  type: string;
  start_at: string | null;
  end_at: string | null;
  recurrence: string;
  days_of_week: number[];
  time_of_day: string | null;
} | null | undefined): string {
  if (!s) return '—';
  const parts: string[] = [scheduleTypeLabel[s.type] ?? s.type];
  if (s.start_at) parts.push(`از ${formatDateTime(s.start_at)}`);
  if (s.end_at) parts.push(`تا ${formatDateTime(s.end_at)}`);
  if (s.recurrence === 'daily') parts.push('روزانه');
  if (s.recurrence === 'weekly') {
    const days = (s.days_of_week ?? []).map((d) => daysOfWeekLabel[d] ?? d).join('، ');
    parts.push(`هفتگی (${days || '—'})`);
  }
  if (s.time_of_day) parts.push(`ساعت ${s.time_of_day}`);
  return parts.join(' • ');
}

// ------------------------------------------------ تشخیص نوع فایل از پسوند
export function detectType(filename: string): 'video' | 'audio' | 'image' | 'pdf' | 'html' | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['zip', 'html'].includes(ext)) return 'html';
  return null;
}
