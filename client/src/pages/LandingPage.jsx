import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  CircleSlash2,
  Download,
  FileCheck2,
  FileText,
  LayoutTemplate,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Badge, Button } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

const FEATURES = [
  {
    icon: UploadCloud,
    title: 'Start from your real resume',
    body: 'Upload a DOCX and keep the file you already trust. The original package is parsed, stored privately, and never modified.',
  },
  {
    icon: ScanSearch,
    title: 'See the evidence first',
    body: 'Every proposal is checked against your actual resume text. If the support is not there, the suggestion is dropped instead of invented.',
  },
  {
    icon: FileCheck2,
    title: 'Review every word',
    body: 'Accept, reject, or rewrite each suggestion. Track what changed and export only the decisions you approved.',
  },
  {
    icon: LayoutTemplate,
    title: 'Keep the layout you built',
    body: 'The export edits a copy of the original DOCX, preserving styles, tables, headers, footers, links, images, and page setup.',
  },
];

const STEPS = [
  {
    number: '01',
    title: 'Upload your DOCX',
    body: 'We map paragraphs, sections, tables, headers, footers, and formatting so you can see exactly what is safe to edit.',
  },
  {
    number: '02',
    title: 'Paste the job description',
    body: 'Requirements are extracted and matched to evidence in your resume. You get an internal coverage estimate, not an ATS score.',
  },
  {
    number: '03',
    title: 'Review and export',
    body: 'Approve what is accurate, edit what needs your voice, and download a validated copy. Pending and rejected changes stay out.',
  },
];

const LIMITS = [
  'It will not invent employers, dates, degrees, certifications, tools, metrics, or achievements.',
  'It cannot guarantee interviews, ATS results, or hiring outcomes.',
  'It does not submit applications for you.',
  'The HTML preview is an approximation — Word may paginate and reflow the exported DOCX differently.',
];

export default function LandingPage() {
  usePageTitle('Tailor your resume honestly');
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm text-ink-600 md:flex" aria-label="Landing navigation">
            <a href="#features" className="hover:text-ink-950">Features</a>
            <a href="#how-it-works" className="hover:text-ink-950">How it works</a>
            <a href="#limits" className="hover:text-ink-950">Limits</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button size="sm" onClick={() => (window.location.href = '/app')}>
                Open dashboard
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-slate-100 sm:block"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent-700 px-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-accent-800"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50">
          <div className="absolute inset-0 subtle-grid opacity-60" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-800 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Evidence-based tailoring
              </span>
              <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight text-ink-950 sm:text-5xl lg:text-[56px]">
                Tailor your resume
                <br className="hidden sm:block" />
                without rewriting who you are.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
                Upload your existing DOCX, paste a job description, and get
                targeted suggestions backed by text that is already in your
                resume. Review every change. Keep your original formatting.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  to={user ? '/app/upload' : '/register'}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-accent-700 px-6 text-base font-medium text-white shadow-sm transition hover:bg-accent-800"
                >
                  {user ? 'Upload a resume' : 'Create an account'}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to={user ? '/app' : '/login'}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-ink-800 transition hover:bg-slate-50"
                >
                  {user ? 'Open dashboard' : 'Sign in'}
                </Link>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
                {['DOCX only', 'Private storage', 'Human review required', 'No fabricated facts'].map((item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-accent-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-accent-100/70 to-slate-200/40 blur-xl" aria-hidden="true" />
              <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-pop sm:p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                    Review workspace
                  </div>
                  <Badge variant="neutral">Illustrative example</Badge>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                      Original
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                      Responsible for building internal dashboards and improving
                      reporting workflows for the operations team.
                    </p>
                  </div>

                  <div className="rounded-xl border border-accent-200 bg-accent-50/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-800">
                        Proposed wording
                      </p>
                      <Badge variant="success">Supported</Badge>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-800">
                      Built internal dashboards and improved reporting workflows
                      for the operations team.
                    </p>
                    <p className="mt-2.5 text-xs leading-relaxed text-ink-500">
                      Evidence: the original sentence describes the same work.
                      Titles, dates, and tools are unchanged.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-8 items-center rounded-lg bg-accent-700 px-3 text-xs font-medium text-white">
                      Accept change
                    </span>
                    <span className="inline-flex h-8 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-ink-600">
                      Edit wording
                    </span>
                    <span className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-ink-500">
                      Reject
                    </span>
                    <span className="ml-auto text-[10px] text-ink-400">
                      No new skills or metrics
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-700">
              Built for control
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">
              A careful editor, not an autopilot.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-500 sm:text-base">
              The goal is a more relevant version of your resume — not a
              different person&apos;s resume. The workflow is designed around
              proof, review, and reversibility.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="surface p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-700">
                  How it works
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">
                  Three deliberate steps.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-ink-500">
                Analysis runs in the background and reports its real progress.
                If a job is interrupted, the UI tells you and lets you retry.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.number} className="relative rounded-xl border border-slate-200 bg-white p-6 shadow-card">
                  <span className="text-xs font-semibold tracking-[0.16em] text-accent-600">{step.number}</span>
                  <h3 className="mt-3 text-base font-semibold text-ink-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="limits" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <CircleSlash2 className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-ink-950">
                What this tool won&apos;t do
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-500">
                Honest limits matter more than confident marketing. If a
                suggestion cannot be supported by your resume, it should not be
                in your application.
              </p>
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-ink-600">
                <p className="font-medium text-ink-800">Choose your analyzer</p>
                <p className="mt-1">
                  The default local analyzer is deterministic and makes no
                  external AI calls. An administrator can configure OpenAI or
                  Anthropic for deeper rewriting, subject to the same evidence
                  checks.
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {LIMITS.map((limit) => (
                <li key={limit} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-ink-600 shadow-card">
                  <CircleSlash2 className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                  {limit}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-ink-950">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 lg:flex-row lg:items-center lg:px-8">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Bring your resume. Keep your story.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">
                Start with a DOCX and a job description. Leave with changes you
                can defend in an interview.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to={user ? '/app/upload' : '/register'}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-medium text-ink-950 transition hover:bg-slate-100"
              >
                {user ? 'Upload a resume' : 'Get started'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/privacy"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/20 px-5 text-sm font-medium text-white/80 transition hover:bg-white/10"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Privacy notice
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-ink-950">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-white/40 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            AI Resume Tailor · Evidence-first DOCX editing
          </span>
          <span className="inline-flex items-center gap-2">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Export only what you approve.
          </span>
        </div>
      </footer>
    </div>
  );
}
