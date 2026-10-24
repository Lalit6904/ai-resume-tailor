import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { labelForStatus } from '../utils/format.js';

const BUTTON_VARIANTS = {
  primary:
    'bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900 border-transparent shadow-sm',
  secondary:
    'bg-white text-ink-800 border-slate-300 hover:bg-slate-50 hover:border-slate-400',
  subtle: 'bg-slate-100 text-ink-800 border-transparent hover:bg-slate-200',
  ghost: 'bg-transparent text-ink-700 border-transparent hover:bg-slate-100',
  danger: 'bg-rose-600 text-white border-transparent hover:bg-rose-700',
  'danger-soft': 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
        BUTTON_SIZES[size] || BUTTON_SIZES.md,
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className, as: Tag = 'div', ...props }) {
  return (
    <Tag className={clsx('surface', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className, icon: Icon }) {
  return (
    <div className={clsx('flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 rounded-lg bg-slate-100 p-2 text-ink-600">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-ink-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

const BADGE_VARIANTS = {
  neutral: 'bg-slate-100 text-ink-700 ring-slate-200',
  accent: 'bg-accent-50 text-accent-800 ring-accent-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function Badge({ children, variant = 'neutral', className, dot = false }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        BADGE_VARIANTS[variant] || BADGE_VARIANTS.neutral,
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STATUS_VARIANTS = {
  queued: 'neutral',
  analyzing: 'info',
  completed: 'success',
  failed: 'danger',
  pending: 'neutral',
  approved: 'success',
  rejected: 'danger',
  modified: 'accent',
  processing: 'info',
  ready: 'success',
  expired: 'warning',
  passed: 'success',
  warning: 'warning',
  demonstrated: 'success',
  partially_demonstrated: 'warning',
  not_evidenced: 'neutral',
  low: 'success',
  medium: 'warning',
  high: 'danger',
  valid: 'success',
};

export function StatusBadge({ status, label, className }) {
  const variant = STATUS_VARIANTS[status] || 'neutral';
  const isActive = status === 'analyzing' || status === 'processing';
  return (
    <Badge variant={variant} dot className={className}>
      {label || (isActive ? `${labelForStatus(status)}…` : labelForStatus(status))}
    </Badge>
  );
}

const ALERT_STYLES = {
  info: { wrap: 'border-sky-200 bg-sky-50/70', icon: 'text-sky-600', title: 'text-sky-950' },
  success: { wrap: 'border-emerald-200 bg-emerald-50/70', icon: 'text-emerald-600', title: 'text-emerald-950' },
  warning: { wrap: 'border-amber-200 bg-amber-50/70', icon: 'text-amber-600', title: 'text-amber-950' },
  danger: { wrap: 'border-rose-200 bg-rose-50/70', icon: 'text-rose-600', title: 'text-rose-950' },
};

export function Alert({ variant = 'warning', title, children, className, action }) {
  const style = ALERT_STYLES[variant] || ALERT_STYLES.warning;
  const Icon = variant === 'danger' ? AlertCircle : variant === 'info' ? Info : variant === 'success' ? CheckCircle2 : CircleAlert;
  return (
    <div className={clsx('rounded-xl border p-4', style.wrap, className)} role={variant === 'danger' ? 'alert' : 'status'}>
      <div className="flex gap-3">
        <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', style.icon)} aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm leading-relaxed text-ink-700">
          {title ? <p className={clsx('font-semibold', style.title)}>{title}</p> : null}
          {children ? <div className={title ? 'mt-1' : ''}>{children}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ size = 'md', className, label = 'Loading' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-9 w-9' };
  return (
    <span className={clsx('inline-flex items-center gap-2 text-sm text-ink-500', className)} role="status">
      <Loader2 className={clsx('animate-spin text-accent-700', sizes[size])} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LoadingBlock({ label = 'Loading…', className }) {
  return (
    <div className={clsx('flex min-h-[220px] items-center justify-center gap-3', className)}>
      <Spinner />
      <span className="text-sm text-ink-500">{label}</span>
    </div>
  );
}

export function FullPageLoading({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="flex items-center gap-3 text-sm text-ink-500">
        <Spinner />
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, retryLabel = 'Try again', className }) {
  return (
    <div className={clsx('surface flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <CircleAlert className="h-5 w-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-ink-900">{title}</h2>
      {message ? <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value = 0, className, label }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={className}>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-500">
          <span>{label}</span>
          <span>{Math.round(clamped)}%</span>
        </div>
      ) : null}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={label || 'Progress'}
      >
        <div
          className="h-full rounded-full bg-accent-600 transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink-950/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          'relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop animate-fade-in',
          sizes[size] || sizes.md,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-ink-900">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-slate-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  loading = false,
  children,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className }) {
  return (
    <div className={clsx('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-700">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon = CircleAlert, title, description, action, className }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center', className)}>
      <span className="mb-4 rounded-full bg-slate-100 p-3 text-ink-500">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Field({ label, hint, error, htmlFor, children, className }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-800">
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose-700">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClassName =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-ink-900 shadow-sm placeholder:text-ink-400 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-slate-50 disabled:text-ink-500';

export function TextInput({ className, ...props }) {
  return <input className={clsx(inputClassName, className)} {...props} />;
}

export function TextArea({ className, ...props }) {
  return (
    <textarea
      className={clsx(inputClassName, 'min-h-[120px] resize-y leading-relaxed', className)}
      {...props}
    />
  );
}

export function InlineLink({ children, className, ...props }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 font-medium text-accent-700', className)} {...props}>
      {children}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}

export function KeyValue({ label, value, className }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-800">{value ?? '—'}</dd>
    </div>
  );
}
