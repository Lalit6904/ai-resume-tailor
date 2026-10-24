import { Link } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';
import clsx from 'clsx';

export default function Logo({ to = '/', compact = false, className }) {
  const content = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-700 text-white shadow-sm">
        <FileCheck2 className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      {compact ? null : (
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-5 tracking-tight text-ink-950">
            AI Resume Tailor
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
            Evidence first
          </span>
        </span>
      )}
    </>
  );

  if (!to) {
    return <div className={clsx('flex items-center gap-2.5', className)}>{content}</div>;
  }

  return (
    <Link
      to={to}
      className={clsx('flex items-center gap-2.5 rounded-lg', className)}
      aria-label="AI Resume Tailor home"
    >
      {content}
    </Link>
  );
}
