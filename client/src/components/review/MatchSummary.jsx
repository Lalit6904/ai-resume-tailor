import { useMemo, useState } from 'react';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleHelp,
  Info,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { Alert, Badge, Card, CardHeader, StatusBadge } from '../ui.jsx';
import { labelForStatus } from '../../utils/format.js';

const STATUS_FILTERS = [
  { key: 'all', label: 'All requirements' },
  { key: 'demonstrated', label: 'Supported' },
  { key: 'partially_demonstrated', label: 'Partial' },
  { key: 'not_evidenced', label: 'Not found' },
];

const IMPORTANCE_VARIANTS = { high: 'warning', medium: 'neutral', low: 'neutral' };

function SectionList({ title, items, empty = 'None extracted' }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</p>
      {items?.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <Badge key={item} variant="neutral">{item}</Badge>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-400">{empty}</p>
      )}
    </div>
  );
}

export default function MatchSummary({ session }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const requirements = session.requirements || [];
  const summary = session.matchingSummary || {};
  const coverage = session.coverage;
  const job = session.jobAnalysis || {};

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requirements;
    return requirements.filter((requirement) => requirement.status === statusFilter);
  }, [requirements, statusFilter]);

  const counts = useMemo(() => {
    const base = { demonstrated: 0, partially_demonstrated: 0, not_evidenced: 0 };
    for (const requirement of requirements) {
      if (base[requirement.status] !== undefined) base[requirement.status] += 1;
    }
    return base;
  }, [requirements]);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="grid gap-0 md:grid-cols-[0.9fr_1.1fr]">
          <div className="border-b border-slate-100 p-5 md:border-b-0 md:border-r">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-700">
              Internal coverage estimate
            </p>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-tight text-ink-950">
                {coverage?.percent != null ? coverage.percent : '—'}
              </span>
              <span className="pb-1.5 text-sm text-ink-400">
                {coverage?.percent != null ? '%' : 'not available'}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-500">
              This is a deterministic coverage estimate computed from the
              requirements below. It is <span className="font-semibold text-ink-700">not an ATS score</span>{' '}
              and does not predict hiring outcomes.
            </p>
            {coverage?.formula ? (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[10px] leading-relaxed text-ink-500">
                {coverage.formula}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Requirements</p>
              <p className="mt-1 text-xl font-semibold text-ink-950">{summary.total ?? requirements.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Supported</p>
              <p className="mt-1 text-xl font-semibold text-emerald-900">{counts.demonstrated}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Partial</p>
              <p className="mt-1 text-xl font-semibold text-amber-900">{counts.partially_demonstrated}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Not found</p>
              <p className="mt-1 text-xl font-semibold text-ink-900">{counts.not_evidenced}</p>
            </div>
          </div>
        </div>
      </Card>

      <Alert variant="info" title="How to read requirement matches">
        “Not found” means the resume text did not contain enough evidence for the
        matcher — it does not mean you lack the qualification. Use those gaps to
        decide what to add yourself, not to invent experience.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader title="Role analysis" icon={BriefcaseBusiness} />
          <div className="space-y-4 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Detected role</p>
              <p className="mt-1 text-base font-semibold text-ink-900">{job.jobTitle || session.label}</p>
              {job.seniority ? (
                <p className="mt-0.5 text-xs text-ink-500">Seniority signal: {job.seniority}</p>
              ) : null}
            </div>

            {job.experienceRequirements ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                  Experience language
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{job.experienceRequirements}</p>
              </div>
            ) : null}

            <SectionList title="Required skills" items={job.requiredSkills} />
            <SectionList title="Preferred skills" items={job.preferredSkills} />
            <SectionList title="Tools" items={job.tools} />
            <SectionList title="Responsibilities" items={job.responsibilities} />
            <SectionList title="Qualifications" items={job.qualifications} />
            <SectionList title="Terminology" items={job.terminology} />

            <details className="group border-t border-slate-100 pt-3">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-ink-600">
                Full job description
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-ink-600 scrollbar-thin">
                {session.jobDescription}
              </p>
            </details>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Requirement evidence"
            description="Each requirement is matched against paragraphs in your resume. Evidence is quoted, not generated."
            icon={BadgeCheck}
          />
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 py-3">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setStatusFilter(filter.key)}
                className={clsx(
                  'rounded-full px-2.5 py-1 text-[11px] font-medium transition',
                  statusFilter === filter.key
                    ? 'bg-ink-900 text-white'
                    : 'bg-slate-100 text-ink-600 hover:bg-slate-200',
                )}
              >
                {filter.label}
                {filter.key !== 'all' ? ` (${counts[filter.key]})` : ` (${requirements.length})`}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <CircleHelp className="h-6 w-6 text-ink-300" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-ink-700">No requirements in this category</p>
              <p className="mt-1 text-xs text-ink-500">
                The job description may not have produced extractable requirements here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((requirement) => (
                <li key={requirement.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-ink-800">{requirement.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="neutral">{requirement.id}</Badge>
                        <Badge variant="neutral">{labelForStatus(requirement.type)}</Badge>
                        <Badge variant={IMPORTANCE_VARIANTS[requirement.importance] || 'neutral'}>
                          {labelForStatus(requirement.importance)} importance
                        </Badge>
                      </div>
                    </div>
                    <StatusBadge status={requirement.status} className="shrink-0" />
                  </div>

                  {requirement.evidence?.length ? (
                    <div className="mt-2.5 space-y-1.5 border-l-2 border-emerald-200 pl-3">
                      {requirement.evidence.map((quote, index) => (
                        <p key={`${requirement.id}-evidence-${index}`} className="text-xs leading-relaxed text-ink-500">
                          {quote}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] italic text-ink-400">
                      No resume evidence quoted for this requirement.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Analysis transparency" icon={ShieldCheck} />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-accent-700" aria-hidden="true" />
            <span className="font-medium text-ink-800">
              {session.ai?.provider === 'heuristic'
                ? 'Local deterministic analyzer'
                : `AI provider: ${session.ai?.provider || 'unknown'}`}
            </span>
            <Badge variant={session.ai?.provider === 'heuristic' ? 'neutral' : 'violet'}>
              {session.ai?.model || 'model not recorded'}
            </Badge>
          </div>

          {session.ai?.provider === 'heuristic' ? (
            <Alert variant="info" title="No external AI service was called">
              This session used the built-in heuristic analyzer. It only makes
              limited, safe wording and ordering changes. Configure an AI provider
              on the server for deeper rewriting; the same evidence and safety
              checks still apply.
            </Alert>
          ) : null}

          {session.ai?.warnings?.length ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                Analysis notes
              </p>
              {session.ai.warnings.map((warning) => (
                <p key={warning} className="flex gap-2 text-xs leading-relaxed text-ink-600">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          {session.ai?.discarded?.length ? (
            <details className="group rounded-lg border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-ink-600">
                <span className="inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  {session.ai.discarded.length} generated suggestion
                  {session.ai.discarded.length === 1 ? '' : 's'} discarded by safety checks
                </span>
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="space-y-1.5 border-t border-slate-200 px-3 py-2.5">
                {session.ai.discarded.map((item, index) => (
                  <li key={`${item.locationId}-${index}`} className="text-[11px] leading-relaxed text-ink-500">
                    <span className="font-medium text-ink-700">{item.code || 'DISCARDED'}</span>
                    {' · '}
                    {item.reason}
                    {item.locationId ? <span className="text-ink-400"> ({item.locationId})</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-ink-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              No suggestions were discarded by safety validation in this session.
            </p>
          )}

          <p className="flex gap-2 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-ink-400">
            <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Matching is deterministic and conservative. A missing match can be a
            wording gap in your resume; a partial match can still be a strong
            qualification. Make the final call yourself.
          </p>
        </div>
      </Card>
    </div>
  );
}
