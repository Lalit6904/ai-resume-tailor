import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  Clock3,
  Download,
  Filter,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  getApiError,
} from '../services/api.js';
import { formatDate, labelForStatus } from '../utils/format.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatusBadge,
  TextInput,
  inputClassName,
} from '../components/ui.jsx';
import SuggestionCard from '../components/review/SuggestionCard.jsx';
import MatchSummary from '../components/review/MatchSummary.jsx';
import ExportPanel from '../components/review/ExportPanel.jsx';
import { useToast } from '../context/ToastContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

const TABS = [
  { key: 'review', label: 'Suggestions', icon: ListChecks },
  { key: 'match', label: 'Job match', icon: Target },
  { key: 'export', label: 'Preview & export', icon: Download },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'modified', label: 'Edited' },
  { key: 'rejected', label: 'Rejected' },
];

const STAGES = [
  { key: 'analyzing_job', label: 'Reading the job description', detail: 'Extracting requirements and terminology.' },
  { key: 'analyzing_resume', label: 'Matching your resume', detail: 'Looking for evidence in your actual paragraphs.' },
  { key: 'generating_suggestions', label: 'Generating and validating suggestions', detail: 'Dropping anything unsupported by your text.' },
];

const BULK_COPY = {
  accept_all: {
    title: 'Accept all pending suggestions?',
    description: 'This approves every pending suggestion in this session, regardless of the filters shown.',
    confirmLabel: 'Accept all pending',
    variant: 'primary',
  },
  reject_all: {
    title: 'Reject all pending suggestions?',
    description: 'Every pending suggestion will be marked rejected and excluded from the export.',
    confirmLabel: 'Reject all pending',
    variant: 'danger',
  },
  reset_all: {
    title: 'Reset every decision?',
    description: 'All accepted, edited, and rejected suggestions return to pending. Your original resume is untouched.',
    confirmLabel: 'Reset all decisions',
    variant: 'secondary',
  },
};

function computeSummary(edits) {
  const summary = { total: edits.length, pending: 0, approved: 0, rejected: 0, modified: 0, highRisk: 0 };
  for (const edit of edits) {
    if (summary[edit.status] !== undefined) summary[edit.status] += 1;
    if (edit.risk === 'high') summary.highRisk += 1;
  }
  return summary;
}

function reviewPayload(data) {
  return {
    session: data.session,
    edits: data.edits || [],
    editVersion: data.session?.editVersion ?? 1,
  };
}

export default function ReviewPage() {
  const { resumeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const initialTab = searchParams.get('tab') === 'export' ? 'export' : 'review';

  const [resume, setResume] = useState(null);
  const [session, setSession] = useState(null);
  const [edits, setEdits] = useState([]);
  const [editVersion, setEditVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [search, setSearch] = useState('');

  const summary = useMemo(() => computeSummary(edits), [edits]);

  const sections = useMemo(
    () => [...new Set(edits.map((edit) => edit.sectionName || 'General'))].sort(),
    [edits],
  );

  const filteredEdits = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return edits.filter((edit) => {
      if (statusFilter !== 'all' && edit.status !== statusFilter) return false;
      if (sectionFilter !== 'all' && edit.sectionName !== sectionFilter) return false;
      if (riskFilter !== 'all' && edit.risk !== riskFilter) return false;
      if (!normalized) return true;
      return [edit.originalText, edit.proposedText, edit.finalText, edit.reason, edit.sectionName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [edits, statusFilter, sectionFilter, riskFilter, search]);

  usePageTitle(session?.jobTitle || 'Review workspace');

  const loadEditsForSession = useCallback(
    async (sessionId) => {
      const response = await api.get(`/resumes/${resumeId}/edits`, {
        params: { sessionId },
      });
      const payload = reviewPayload(response.data.data);
      setSession(payload.session);
      setEdits(payload.edits);
      setEditVersion(payload.editVersion);
      return payload;
    },
    [resumeId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEdits([]);
    setSession(null);

    (async () => {
      try {
        const resumeResponse = await api.get(`/resumes/${resumeId}`);
        if (cancelled) return;
        setResume(resumeResponse.data.data.resume);
      } catch (err) {
        if (cancelled) return;
        setError(getApiError(err, 'Unable to load this resume.'));
        setLoading(false);
        return;
      }

      try {
        const params = sessionParam ? { sessionId: sessionParam } : undefined;
        const response = await api.get(`/resumes/${resumeId}/edits`, { params });
        if (cancelled) return;
        const payload = reviewPayload(response.data.data);
        setSession(payload.session);
        setEdits(payload.edits);
        setEditVersion(payload.editVersion);
      } catch (err) {
        if (cancelled) return;
        const apiError = getApiError(err, 'Unable to load review suggestions.');
        if (apiError.code !== 'NO_SESSION') setError(apiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeId, sessionParam]);

  // Poll the real analysis job until it finishes. The server persists progress,
  // so this is not a simulated progress animation.
  useEffect(() => {
    if (!session || !['queued', 'analyzing'].includes(session.status)) return undefined;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const response = await api.get(`/sessions/${session.id}`);
        if (cancelled) return;
        const nextSession = response.data.data.session;
        setSession(nextSession);
        if (nextSession.status === 'completed') {
          try {
            await loadEditsForSession(nextSession.id);
          } catch (err) {
            if (!cancelled) {
              setError(getApiError(err, 'Analysis completed but suggestions could not be loaded.'));
            }
          }
        }
      } catch (err) {
        if (!cancelled && err.response?.status === 404) {
          setError(getApiError(err, 'This analysis session could not be found.'));
        }
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.id, session?.status, loadEditsForSession]);

  async function handleAction(edit, action, text) {
    setBusyId(edit.id);
    try {
      const response = await api.patch(`/resumes/${resumeId}/edits/${edit.id}`, {
        action,
        ...(text !== undefined ? { text } : {}),
        version: edit.version,
      });
      const updated = response.data.data.edit;
      setEdits((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setEditVersion(response.data.data.editVersion);
      if (action === 'modify') toast.success('Your edit was saved and approved.');
      return true;
    } catch (err) {
      const apiError = getApiError(err, 'Unable to save this review decision.');
      if (apiError.code === 'STALE_REVIEW_VERSION') {
        toast.error('This suggestion changed elsewhere. The latest review list was reloaded.');
        try {
          await loadEditsForSession(session.id);
        } catch {
          setError(apiError);
        }
      } else {
        toast.error(apiError.message);
      }
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function runBulk(action) {
    setBulkConfirm(null);
    setBulkBusy(action);
    try {
      const response = await api.post(`/resumes/${resumeId}/edits/bulk-review`, {
        action,
        sessionId: session.id,
      });
      setEdits(response.data.data.edits);
      setEditVersion(response.data.data.editVersion);
      const count = response.data.data.modifiedCount;
      toast.success(
        action === 'accept_all'
          ? `Accepted ${count} pending suggestion${count === 1 ? '' : 's'}.`
          : action === 'reject_all'
            ? `Rejected ${count} pending suggestion${count === 1 ? '' : 's'}.`
            : `Reset ${count} review decision${count === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      const apiError = getApiError(err, 'Unable to update the review decisions.');
      toast.error(apiError.message);
      if (apiError.code === 'STALE_REVIEW_VERSION') {
        try {
          await loadEditsForSession(session.id);
        } catch {
          setError(apiError);
        }
      }
    } finally {
      setBulkBusy(null);
    }
  }

  async function refreshReview() {
    if (!session) return;
    setRefreshing(true);
    try {
      await loadEditsForSession(session.id);
      toast.info('Review decisions refreshed.');
    } catch (err) {
      toast.error(getApiError(err, 'Unable to refresh the review list.').message);
    } finally {
      setRefreshing(false);
    }
  }

  async function retryAnalysis() {
    if (!session) return;
    setRetrying(true);
    try {
      const response = await api.post(`/sessions/${session.id}/retry`);
      setSession(response.data.data.session);
      setEdits([]);
      toast.info('Analysis queued again.');
    } catch (err) {
      toast.error(getApiError(err, 'Unable to retry the analysis.').message);
    } finally {
      setRetrying(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading review workspace…" className="min-h-[460px]" />;
  }

  if (error && !resume) {
    return (
      <div className="space-y-4">
        <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <ErrorState
          title={error.status === 404 ? 'Resume not found' : 'Could not open this review'}
          message={error.message}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-5">
        <Link
          to={`/app/resumes/${resumeId}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to resume
        </Link>
        <EmptyState
          icon={Sparkles}
          title="No analysis yet"
          description="Paste a job description on the resume page to generate reviewable suggestions. Your original DOCX will not be modified."
          action={
            <Button onClick={() => navigate(`/app/resumes/${resumeId}`)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Add a job description
            </Button>
          }
        />
      </div>
    );
  }

  const isWorking = ['queued', 'analyzing'].includes(session.status);
  const activeStageIndex = Math.max(
    -1,
    STAGES.findIndex((stage) => stage.key === session.stage),
  );

  return (
    <div className="space-y-5">
      <Link
        to={`/app/resumes/${resumeId}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to resume details
      </Link>

      <PageHeader
        eyebrow="Review workspace"
        title={session.jobTitle || session.label || 'Tailoring session'}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{resume?.originalFilename}</span>
            <span className="text-ink-300">·</span>
            <span>{formatDate(session.createdAt, { withTime: true })}</span>
            <span className="text-ink-300">·</span>
            <span>
              {session.ai?.provider === 'heuristic'
                ? 'Local deterministic analyzer'
                : `${session.ai?.provider || 'AI'} · ${session.ai?.model || 'model'}`}
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={session.status} />
            <Button variant="secondary" size="sm" onClick={refreshReview} loading={refreshing} disabled={isWorking}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </>
        }
      />

      {isWorking ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Analysis in progress"
            description="Progress comes from the server job, not a simulated animation. You can leave this page; the job continues."
            icon={Clock3}
          />
          <div className="space-y-5 p-5">
            <div>
              <ProgressBar value={session.progress || 0} label={labelForStatus(session.stage)} />
              <p className="mt-2 text-xs text-ink-500">
                Status: {labelForStatus(session.status)} · {session.progress || 0}% complete
              </p>
            </div>

            <ol className="grid gap-3 sm:grid-cols-3">
              {STAGES.map((stage, index) => {
                const isActive = index === activeStageIndex;
                const isDone = activeStageIndex > index || session.stage === 'completed';
                return (
                  <li
                    key={stage.key}
                    className={clsx(
                      'rounded-xl border p-4',
                      isActive
                        ? 'border-accent-300 bg-accent-50/60'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-slate-50/60',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                      ) : isActive ? (
                        <RefreshCw className="h-4 w-4 animate-spin text-accent-700" aria-hidden="true" />
                      ) : (
                        <Clock3 className="h-4 w-4 text-ink-400" aria-hidden="true" />
                      )}
                      <p className="text-sm font-medium text-ink-800">{stage.label}</p>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{stage.detail}</p>
                  </li>
                );
              })}
            </ol>

            <Alert variant="info" title="Nothing is being changed">
              This step only analyzes a copy of your resume and generates
              suggestions. The original DOCX stays untouched until you review and
              export approved changes.
            </Alert>
          </div>
        </Card>
      ) : null}

      {session.status === 'failed' ? (
        <Card className="overflow-hidden">
          <CardHeader title="Analysis failed" icon={TriangleAlert} />
          <div className="space-y-4 p-5">
            <Alert variant="danger" title={session.error?.code || 'Analysis failed'}>
              {session.error?.message || 'The analysis could not be completed.'}
            </Alert>
            <p className="text-xs leading-relaxed text-ink-500">
              Your original resume and any previous completed reviews are
              unaffected. Retrying starts a fresh analysis for this session.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={retryAnalysis} loading={retrying} disabled={!session.error?.retryable}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry analysis
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/app/resumes/${resumeId}`)}>
                Back to resume
              </Button>
            </div>
            {!session.error?.retryable ? (
              <p className="text-xs text-ink-400">
                This error is not automatically retryable. Start a new analysis
                from the resume page after checking the job description.
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}

      {session.status === 'completed' ? (
        <>
          {error ? (
            <Alert variant="warning" title="Review refresh needed">
              {error.message}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={refreshReview} loading={refreshing}>
                  Refresh review list
                </Button>
              </div>
            </Alert>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 pt-2">
              <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Review workspace tabs">
                {TABS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.key}
                    onClick={() => setTab(item.key)}
                    className={clsx(
                      'inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
                      tab === item.key
                        ? 'border-accent-700 text-accent-800'
                        : 'border-transparent text-ink-500 hover:text-ink-900',
                    )}
                  >
                    <item.icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                    {item.key === 'review' ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-ink-500">
                        {summary.total}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              <span className="px-2 pb-2 text-[10px] text-ink-400">
                Review v{editVersion}
              </span>
            </div>

            <div className="p-4 sm:p-5">
              {tab === 'review' ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        ['pending', summary.pending, 'neutral'],
                        ['approved', summary.approved, 'success'],
                        ['modified', summary.modified, 'accent'],
                        ['rejected', summary.rejected, 'danger'],
                      ].map(([key, count, variant]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
                          className={clsx(
                            'rounded-full transition',
                            statusFilter === key && 'ring-2 ring-ink-900/20',
                          )}
                          aria-pressed={statusFilter === key}
                        >
                          <Badge variant={variant}>
                            {count} {key === 'modified' ? 'edited' : key}
                          </Badge>
                        </button>
                      ))}
                      {summary.highRisk > 0 ? (
                        <Badge variant="danger">{summary.highRisk} high risk</Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => setBulkConfirm('accept_all')}
                        disabled={summary.pending === 0 || Boolean(bulkBusy)}
                        loading={bulkBusy === 'accept_all'}
                      >
                        <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Accept all pending
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onClick={() => setBulkConfirm('reject_all')}
                        disabled={summary.pending === 0 || Boolean(bulkBusy)}
                        loading={bulkBusy === 'reject_all'}
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Reject all pending
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setBulkConfirm('reset_all')}
                        disabled={summary.total === summary.pending || Boolean(bulkBusy)}
                        loading={bulkBusy === 'reset_all'}
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Reset all
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center">
                    <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
                      {STATUS_FILTERS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => setStatusFilter(filter.key)}
                          className={clsx(
                            'rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                            statusFilter === filter.key
                              ? 'bg-white text-ink-900 shadow-sm ring-1 ring-slate-200'
                              : 'text-ink-500 hover:text-ink-900',
                          )}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 text-xs text-ink-500">
                        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                        Filter
                      </div>
                      <select
                        value={sectionFilter}
                        onChange={(event) => setSectionFilter(event.target.value)}
                        className={clsx(inputClassName, 'h-8 w-auto py-1 text-xs')}
                        aria-label="Filter by section"
                      >
                        <option value="all">All sections</option>
                        {sections.map((section) => (
                          <option key={section} value={section}>{section}</option>
                        ))}
                      </select>
                      <select
                        value={riskFilter}
                        onChange={(event) => setRiskFilter(event.target.value)}
                        className={clsx(inputClassName, 'h-8 w-auto py-1 text-xs')}
                        aria-label="Filter by risk"
                      >
                        <option value="all">Any risk</option>
                        <option value="low">Low risk</option>
                        <option value="medium">Medium risk</option>
                        <option value="high">High risk</option>
                      </select>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                        <TextInput
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search text or reason"
                          className="h-8 w-48 py-1 pl-8 text-xs"
                          aria-label="Search suggestions"
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed text-ink-500">
                    Accept only changes you can defend. Edited suggestions are
                    saved as approved. Rejected and pending suggestions never
                    appear in the exported DOCX.
                  </p>

                  {edits.length === 0 ? (
                    <EmptyState
                      icon={ListChecks}
                      title="No safe suggestions were generated"
                      description="The analyzer did not find a supported, formatting-safe change for this job description. That can happen in local heuristic mode. Review the requirement evidence, then adjust the resume yourself or configure an AI provider and run a new analysis."
                      action={
                        <div className="flex flex-wrap justify-center gap-2">
                          <Button variant="secondary" onClick={() => setTab('match')}>
                            View job match
                          </Button>
                          <Button variant="ghost" onClick={() => navigate(`/app/resumes/${resumeId}`)}>
                            Try another job description
                          </Button>
                        </div>
                      }
                    />
                  ) : filteredEdits.length === 0 ? (
                    <EmptyState
                      icon={Search}
                      title="No suggestions match these filters"
                      description="Clear the status, section, risk, or search filters to see the full review list."
                      action={
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setStatusFilter('all');
                            setSectionFilter('all');
                            setRiskFilter('all');
                            setSearch('');
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {filteredEdits.map((edit) => (
                        <SuggestionCard
                          key={edit.id}
                          edit={edit}
                          busy={busyId === edit.id}
                          onAction={handleAction}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {tab === 'match' ? <MatchSummary session={session} /> : null}

              {tab === 'export' ? (
                <ExportPanel
                  resumeId={resumeId}
                  sessionId={session.id}
                  editVersion={editVersion}
                  summary={summary}
                  onGoToReview={() => setTab('review')}
                />
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(bulkConfirm)}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => runBulk(bulkConfirm)}
        title={bulkConfirm ? BULK_COPY[bulkConfirm].title : ''}
        description={bulkConfirm ? BULK_COPY[bulkConfirm].description : ''}
        confirmLabel={bulkConfirm ? BULK_COPY[bulkConfirm].confirmLabel : 'Confirm'}
        variant={bulkConfirm ? BULK_COPY[bulkConfirm].variant : 'primary'}
        loading={Boolean(bulkBusy)}
      >
        <div className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-ink-500">
          These bulk actions apply to every pending suggestion in this session,
          not just the filtered results. Individual decisions remain reversible
          until you export.
        </div>
      </ConfirmDialog>

      {session.status === 'completed' ? (
        <p className="text-center text-[11px] text-ink-400">
          <span className="font-medium text-ink-500">Reminder:</span> AI-assisted
          wording is a draft. Verify facts, dates, titles, and metrics in the
          downloaded file before submitting it anywhere.
        </p>
      ) : null}
    </div>
  );
}
