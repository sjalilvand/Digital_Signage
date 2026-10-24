import React, { useEffect, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight, Inbox, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useToast } from '../store/toast';

// ---------------------------------------------------------------- Button
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  success: 'bg-cyan-600 hover:bg-cyan-500 text-white',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
  danger: 'bg-red-600 hover:bg-red-500 text-white',
  ghost: 'bg-transparent hover:bg-slate-800 text-slate-300',
};

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  type = 'button',
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- Card
export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl bg-slate-900 border border-slate-800 shadow-lg ${className}`}>{children}</div>;
}

export function CardHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      {actions}
    </div>
  );
}

// ---------------------------------------------------------------- Badge
export function Badge({ label, color, className = '' }: { label: string; color?: string; className?: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${
        color ?? 'bg-slate-700 text-slate-200'
      } ${className}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- TagChip
export function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-xs text-cyan-300">
      {label}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:text-cyan-100" aria-label={`حذف ${label}`}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-2xl`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <h3 className="font-semibold text-slate-100">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="بستن">
            <X size={18} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ConfirmDialog
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأیید',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 text-sm text-slate-300">
          {danger && <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={20} />}
          <div>{message}</div>
        </div>
        <div className="flex items-center gap-2 justify-start">
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            انصراف
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Input / Select / Textarea / Checkbox
const fieldBase =
  'w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`${fieldBase} ${className}`} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`${fieldBase} ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', children, ...rest } = props;
  return (
    <select className={`${fieldBase} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-emerald-500"
      />
      <span className="text-slate-300">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[640px] text-right text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 text-xs font-semibold text-slate-400 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">{children}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- EmptyState / Spinner
export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
      {icon ?? <Inbox size={32} />}
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 size={20} className={`animate-spin text-emerald-400 ${className}`} />;
}

export function PageLoader({ message = 'در حال بارگذاری…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 size={28} className="animate-spin text-emerald-400" />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------- ProgressBar
export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-800 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-cyan-400 transition-all duration-500"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Toasts
export function ToastHost() {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${
            t.kind === 'success'
              ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
              : t.kind === 'error'
                ? 'border-red-500/40 bg-red-950/90 text-red-200'
                : 'border-cyan-500/40 bg-cyan-950/90 text-cyan-200'
          }`}
        >
          {t.kind === 'success' ? (
            <CheckCircle2 size={16} />
          ) : t.kind === 'error' ? (
            <AlertTriangle size={16} />
          ) : (
            <Info size={16} />
          )}
          <span>{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="mr-2 opacity-60 hover:opacity-100" aria-label="بستن">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Pagination
export function Pagination({
  page,
  pageSize,
  count,
  onChange,
}: {
  page: number;
  pageSize: number;
  count: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-3 text-sm text-slate-400">
      <span>
        صفحه {page} از {pages} — {count} مورد
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)} className="px-2 py-1">
          <ChevronRight size={16} />
          قبلی
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)} className="px-2 py-1">
          بعدی
          <ChevronLeft size={16} />
        </Button>
      </div>
    </div>
  );
}
