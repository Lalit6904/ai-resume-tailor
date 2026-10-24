import { Link } from 'react-router-dom';
import { ArrowLeft, Check, FileCheck2, ShieldCheck } from 'lucide-react';
import Logo from './Logo.jsx';

const POINTS = [
  'Your DOCX package, page setup, tables, headers and links stay intact.',
  'Every suggestion cites text already present in your resume.',
  'Nothing is applied without your explicit approval.',
];

export default function AuthLayout({ title, description, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
      <div className="relative hidden overflow-hidden bg-ink-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 subtle-grid opacity-[0.18]" aria-hidden="true" />
        <div className="relative">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>

        <div className="relative max-w-lg">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-accent-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Evidence-first editing
          </span>
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight">
            Keep your resume yours.
            <br />
            Make it fit the role.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/65">
            AI Resume Tailor proposes targeted wording changes, shows the evidence
            behind each one, and exports a reviewed copy of your original DOCX.
          </p>
          <ul className="mt-8 space-y-3.5">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3 text-sm leading-relaxed text-white/75">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/20 text-accent-200">
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-white/40">
          <FileCheck2 className="h-4 w-4" aria-hidden="true" />
          Original file preserved. Suggestions are drafts, not facts.
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Logo />
          <Link to="/" className="text-xs font-medium text-ink-500 hover:text-ink-800 lg:hidden">
            Home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-950">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>
            <div className="mt-7">{children}</div>
            {footer}
          </div>
        </div>

        <p className="px-5 pb-6 text-center text-xs leading-relaxed text-ink-400 sm:px-8">
          By continuing you agree to use the tool responsibly. See our{' '}
          <Link to="/privacy" className="font-medium text-ink-600 underline decoration-ink-300 underline-offset-2 hover:text-ink-900">
            privacy and data handling notice
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
