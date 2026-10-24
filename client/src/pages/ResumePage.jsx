import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { api, getApiError } from '../services/api.js';
import { formatBytes, formatDate, formatRelative, labelForStatus, titleCase } from '../utils/format.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Field,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatusBadge,
  TextArea,
} from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

const COUNT_LABELS = [
  ['tables', 'Tables'],
  ['images', 'Images'],
  ['headers', 'Headers'],
  ['footers', 'Footers'],
  ['hyperlinks', 'Links'],
  ['lists', 'List items'],
];

function sessionAction(session) {
  if (!session) return null;
  if (session.status === 'completed') {
    return { label: 'Open review workspace', icon: ArrowRight };
  }
  if (session.status === 'failed') {
    return { label: 'Open troubleshooting', icon: TriangleAlert };
  }
  return { label: 'View live progress', icon: Clock3 };
}

export default function ResumePage() {
  usePageTitle('Resume details');
  const { resumeId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [formError, setFormError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const response = await api.get(`/resumes/${resumeId}`);
      setData(response.data.data);
    } catch (err) {
      setLoadError(getApiError(err, 'Unable to load this resume.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [resumeId]);

  const resume = data?.resume;
  const latestSession = data?.latestSession;
  const latestExport = data?.latestExport;
  const document = resume?.document || {};

  const jdCount = jobDescription.length;
  const jdTooShort = jdCount > 0 && jdCount < 50;
  const canAnalyze = jdCount >= 50 && jdCount <= 50000 && !starting;

  const editablePreview = useMemo(
    () => (resume?.paragraphs || []).filter((paragraph) => paragraph.text?.trim()),
    [resume],
  );

  async function startAnalysis(event) {
    event.preventDefault();
    setFormError(null);
    if (jdCount < 50) {
      setFormError('Paste a complete job description (at least 50 characters).');
      return;
    }
    if (jdCount > 50000) {
      setFormError('The job description is too long. Limit it to 50,000 characters.');
      return;
    }
    setStarting(true);
    try {
      const response = await api.post(`/resumes/${resumeId}/analyze`, { jobDescription });
      const session = response.data.data.session;
      toast.info('Analysis queued. Progress is shown on the review screen.');
      navigate(`/app/resumes/${resumeId}/review?session=${session.id}`);
    } catch (err) {
      setFormError(getApiError(err, 'Unable to start the analysis.').message);
    } finally {
      setStarting(false);
    }
  }

  async function retryAnalysis() {
    if (!latestSession) return;
    setRetrying(true);
    try {
      await api.post(`/sessions/${latestSession.id}/retry`);
      toast.info('Analysis queued again.');
      navigate(`/app/resumes/${resumeId}/review?session=${latestSession.id}`);
    } catch (err) {
      toast.error(getApiError(err, 'Unable to retry the analysis.').message);
    } finally {
      setRetrying(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/resumes/${resumeId}`);
      toast.success('Resume and all generated artifacts deleted.');
      navigate('/app', { replace: true });
    } catch (err) {
      toast.error(getApiError(err, 'Unable to delete this resume.').message);
      setDeleting(false);
    }
  }

  if (loading) {
    return <LoadingBlock label="Loading resume details…" className="min-h-[420px]" />;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        <ErrorState
          title={loadError.status === 404 ? 'Resume not found' : 'Could not load resume'}
          message={
            loadError.status === 404
              ? 'It may have been deleted or expired. Return to your dashboard to pick another file.'
              : loadError.message
          }
          onRetry={() => load()}
        />
      </div>
    );
  }

  const action = sessionAction(latestSession);

  return (
    <div className="space-y-6">
      <Link to="/app" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to dashboard
      </Link>

      <PageHeader
        eyebrow="Resume workspace"
        title={resume.originalFilename}
        description={`Uploaded ${formatDate(resume.createdAt, { withTime: true })} · ${formatBytes(resume.sizeBytes)} · ${document.wordCount || 0} words`}
        actions={
          <>
            {latestSession ? (
              <Button
                variant="secondary"
                onClick={() => navigate(`/app/resumes/${resumeId}/review?session=${latestSession.id}`)}
              >
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                {action?.label || 'Open session'}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(true)}
              className="text-ink-400 hover:bg-rose-50 hover:text-rose-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </>
        }
      />

      {resume.parseStatus === 'failed' ? (
        <Alert variant="danger" title="This document could not be parsed">
          {resume.parseError?.message || 'Upload a different DOCX file.'}
        </Alert>
      ) : (
        <Alert variant="success" title="Document parsed successfully">
          The original file is stored unchanged. {document.editableCount || 0} of{' '}
          {document.paragraphCount || 0} paragraphs are safe for text replacements;
          headers, footers, headings, links, fields, and complex structures are
          protected.
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Paste the job description"
            description="Include the responsibilities and requirements you want the analysis to consider. Minimum 50 characters."
            icon={BriefcaseBusiness}
          />
          <form onSubmit={startAnalysis} className="space-y-4 p-5">
            <Field htmlFor="job-description" error={formError}>
              <TextArea
                id="job-description"
                value={jobDescription}
                onChange={(event) => {
                  setJobDescription(event.target.value);
                  setFormError(null);
                }}
                placeholder="Paste the full job description here — responsibilities, required skills, qualifications, and tools…"
                className="min-h-[240px]"
                maxLength={50000}
                disabled={starting}
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`text-xs ${jdTooShort ? 'text-amber-700' : 'text-ink-400'}`}>
                {jdCount.toLocaleString()} / 50,000 characters
                {jdTooShort ? ' · add at least 50 characters' : ''}
              </p>
              <Button type="submit" disabled={!canAnalyze} loading={starting}>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Analyze fit
              </Button>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
              Analysis runs in the background with honest progress reporting. You
              can leave the review screen; the job continues. Starting a new
              analysis creates a separate session and does not alter your original
              DOCX.
            </p>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Latest session" icon={Clock3} />
            <div className="p-5">
              {latestSession ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink-900">
                        {latestSession.jobTitle || 'Untitled role'}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        Started {formatRelative(latestSession.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={latestSession.status} />
                  </div>

                  {['queued', 'analyzing'].includes(latestSession.status) ? (
                    <ProgressBar
                      value={latestSession.progress || 0}
                      label={labelForStatus(latestSession.stage)}
                    />
                  ) : null}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                    <span>{latestSession.suggestionCount || 0} suggestions</span>
                    <span>Review version {latestSession.editVersion ?? 1}</span>
                  </div>

                  {latestSession.error?.message ? (
                    <Alert variant="danger" title="Analysis failed">
                      {latestSession.error.message}
                      {latestSession.error.retryable ? (
                        <div className="mt-3">
                          <Button size="sm" variant="danger-soft" onClick={retryAnalysis} loading={retrying}>
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Retry analysis
                          </Button>
                        </div>
                      ) : null}
                    </Alert>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      variant={latestSession.status === 'completed' ? 'primary' : 'secondary'}
                      onClick={() =>
                        navigate(`/app/resumes/${resumeId}/review?session=${latestSession.id}`)
                      }
                    >
                      {latestSession.status === 'completed' ? 'Review suggestions' : 'View progress'}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    {latestSession.status === 'completed' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          navigate(`/app/resumes/${resumeId}/review?session=${latestSession.id}&tab=export`)
                        }
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Export
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center">
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-ink-400">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-ink-800">No analysis yet</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    Paste a job description to generate your first set of reviewable suggestions.
                  </p>
                </div>
              )}
            </div>
          </Card>

          {latestExport ? (
            <Card>
              <CardHeader title="Latest validated export" icon={CheckCircle2} />
              <div className="space-y-2 p-5 text-sm">
                <p className="break-all font-medium text-ink-900">{latestExport.filename}</p>
                <p className="text-xs text-ink-500">
                  Created {formatDate(latestExport.createdAt, { withTime: true })}
                  {latestExport.expiresAt ? ` · expires ${formatDate(latestExport.expiresAt)}` : ''}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="success">Validated</Badge>
                  <Badge variant="neutral">v{latestExport.sourceEditVersion}</Badge>
                </div>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    navigate(`/app/resumes/${resumeId}/review?session=${latestSession?.id || ''}&tab=export`)
                  }
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Open export
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader
          title="Document map"
          description="A read-only view of what the parser found. Only safe body and table paragraphs can receive text suggestions."
          icon={FileText}
          action={<Badge variant="neutral">{document.paragraphCount || 0} paragraphs</Badge>}
        />
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {COUNT_LABELS.map(([key, label]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
                <p className="mt-0.5 text-base font-semibold text-ink-900">{document.counts?.[key] || 0}</p>
              </div>
            ))}
          </div>

          {document.sections?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Sections detected</p>
              <div className="flex flex-wrap gap-1.5">
                {document.sections.map((section) => (
                  <Badge key={`${section.name}-${section.headingLevel}`} variant="accent">
                    {section.name}
                    <span className="opacity-60">· {section.paragraphCount || 0}</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {document.warnings?.length ? (
            <Alert variant="warning" title="Parser notes">
              <ul className="list-disc space-y-1 pl-4">
                {document.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {document.unsupported?.length ? (
            <Alert variant="warning" title="Structures treated as read-only">
              <p>
                These document features are preserved but will not receive text
                edits: {document.unsupported.map((item) => titleCase(item)).join(', ')}.
              </p>
            </Alert>
          ) : null}

          {editablePreview.length ? (
            <details className="group rounded-xl border border-slate-200 bg-white">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-ink-800">
                <span className="inline-flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-ink-400" aria-hidden="true" />
                  Inspect parsed paragraphs
                </span>
                <ChevronDown className="h-4 w-4 text-ink-400 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="max-h-[420px] overflow-y-auto border-t border-slate-100 scrollbar-thin">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-ink-400">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Section</th>
                      <th className="px-3 py-2 font-semibold">Text</th>
                      <th className="px-3 py-2 font-semibold">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {editablePreview.map((paragraph) => (
                      <tr key={paragraph.id} className="align-top">
                        <td className="w-32 px-3 py-2 text-ink-500">{paragraph.section}</td>
                        <td className="px-3 py-2 leading-relaxed text-ink-700">
                          <span className={paragraph.isHeading ? 'font-semibold text-ink-900' : ''}>
                            {paragraph.text}
                          </span>
                        </td>
                        <td className="w-24 px-3 py-2">
                          {paragraph.editable ? (
                            <Badge variant="success">Editable</Badge>
                          ) : (
                            <Badge variant="neutral">Protected</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button variant="secondary" size="sm" onClick={() => navigate('/app/upload')}>
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Upload another resume
            </Button>
            <Button variant="ghost" size="sm" onClick={() => load({ silent: true })}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh details
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => (deleting ? null : setDeleteOpen(false))}
        onConfirm={handleDelete}
        title="Delete this resume?"
        description={`This permanently removes “${resume.originalFilename}”, its sessions, suggestions, and exports. This cannot be undone.`}
        confirmLabel="Delete permanently"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
