import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { api, getApiError } from '../services/api.js';
import { formatDate, formatRelative, labelForStatus } from '../utils/format.js';
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
} from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-ink-950">{value}</p>
          {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-ink-500">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

function sessionStatus(session) {
  if (!session) return null;
  if (session.status === 'completed') return <StatusBadge status="completed" />;
  if (session.status === 'failed') return <StatusBadge status="failed" />;
  return <StatusBadge status={session.status} />;
}

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const toast = useToast();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await api.get('/resumes');
      setResumes(response.data.data.resumes || []);
    } catch (err) {
      setError(getApiError(err, 'Unable to load your resumes.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const completed = resumes.filter((resume) => resume.latestSession?.status === 'completed').length;
    const active = resumes.filter(
      (resume) => resume.latestSession && ['queued', 'analyzing'].includes(resume.latestSession.status),
    ).length;
    const exports = resumes.filter((resume) => resume.latestExport).length;
    return { total: resumes.length, completed, active, exports };
  }, [resumes]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return resumes;
    return resumes.filter((resume) => {
      const haystack = [
        resume.originalFilename,
        resume.latestSession?.jobTitle,
        ...(resume.document?.sections || []).map((section) => section.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [resumes, query]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/resumes/${deleteTarget.id}`);
      setResumes((items) => items.filter((item) => item.id !== deleteTarget.id));
      toast.success(`Deleted “${deleteTarget.originalFilename}” and its generated files.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiError(err, 'Unable to delete this resume.').message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Your resume library"
        description="Upload a DOCX, tailor it to a role, and keep track of every reviewed export. Original files are never edited in place."
        actions={
          <Button onClick={() => navigate('/app/upload')}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New tailoring
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} label="Resumes" value={stats.total} hint="Private DOCX files" />
        <StatCard icon={Sparkles} label="Reviews ready" value={stats.completed} hint="Analyses completed" />
        <StatCard icon={Layers} label="Analyzing" value={stats.active} hint="Running in the background" />
        <StatCard icon={ArrowRight} label="Exports" value={stats.exports} hint="Validated downloads" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Resumes"
          description="Select a resume to paste a job description, review suggestions, or export a tailored copy."
          action={
            resumes.length > 0 ? (
              <div className="relative hidden w-64 sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                <TextInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search resumes or roles"
                  className="h-9 py-1.5 pl-9 text-xs"
                  aria-label="Search resumes"
                />
              </div>
            ) : null
          }
        />

        {loading ? (
          <LoadingBlock label="Loading your resumes…" />
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Could not load resumes" message={error.message} onRetry={() => load()} />
          </div>
        ) : resumes.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={UploadCloud}
              title="No resumes yet"
              description="Upload a Word .docx resume to begin. PDF and legacy .doc files need to be saved as .docx first."
              action={
                <Button onClick={() => navigate('/app/upload')}>
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                  Upload a resume
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">
            No resumes match “{query}”.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((resume) => {
              const session = resume.latestSession;
              const document = resume.document || {};
              const isWorking = session && ['queued', 'analyzing'].includes(session.status);
              return (
                <li key={resume.id} className="px-5 py-4 transition hover:bg-slate-50/70">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3.5">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink-500">
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/app/resumes/${resume.id}`}
                            className="truncate text-sm font-semibold text-ink-950 hover:text-accent-700"
                          >
                            {resume.originalFilename}
                          </Link>
                          {resume.parseStatus === 'ready' ? (
                            <Badge variant="success">Parsed</Badge>
                          ) : resume.parseStatus === 'failed' ? (
                            <Badge variant="danger">Parse failed</Badge>
                          ) : (
                            <Badge variant="neutral">Parsing</Badge>
                          )}
                          {sessionStatus(session)}
                          {resume.latestExport ? <Badge variant="violet">Export ready</Badge> : null}
                        </div>

                        <p className="mt-1 text-xs text-ink-500">
                          Uploaded {formatDate(resume.createdAt)}
                          {resume.expiresAt ? ` · expires ${formatDate(resume.expiresAt)}` : ' · no automatic expiry'}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                          <span>{document.wordCount || 0} words</span>
                          <span>{document.editableCount || 0} editable paragraphs</span>
                          {document.counts?.tables ? <span>{document.counts.tables} tables</span> : null}
                          {session?.jobTitle ? (
                            <span className="truncate">
                              Target: <span className="font-medium text-ink-700">{session.jobTitle}</span>
                            </span>
                          ) : null}
                          {session?.updatedAt ? <span>Updated {formatRelative(session.updatedAt)}</span> : null}
                        </div>

                        {isWorking ? (
                          <div className="mt-3 max-w-sm">
                            <ProgressBar value={session.progress || 0} label={labelForStatus(session.stage)} />
                          </div>
                        ) : null}

                        {session?.error?.message ? (
                          <p className="mt-2 text-xs text-rose-700">{session.error.message}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pl-4">
                      {session?.status === 'completed' ? (
                        <Button
                          size="sm"
                          onClick={() => navigate(`/app/resumes/${resume.id}/review?session=${session.id}`)}
                        >
                          Review changes
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" onClick={() => navigate(`/app/resumes/${resume.id}`)}>
                        {session?.status === 'failed' ? 'Troubleshoot' : 'Open'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(resume)}
                        aria-label={`Delete ${resume.originalFilename}`}
                        className="text-ink-400 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {resumes.length > 0 ? (
        <Alert variant="info" title="What stays private">
          Resume files, job descriptions, suggestions, and exports are scoped to
          your account. Generated files expire according to the server&apos;s retention
          setting. You can delete a resume and its artifacts at any time.
        </Alert>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => (deleting ? null : setDeleteTarget(null))}
        onConfirm={handleDelete}
        title="Delete this resume?"
        description={`This permanently removes “${deleteTarget?.originalFilename || 'this resume'}”, its analysis sessions, suggestions, and generated exports. This cannot be undone.`}
        confirmLabel="Delete permanently"
        variant="danger"
        loading={deleting}
      >
        <p className="text-sm leading-relaxed text-ink-600">
          If you only want a fresh analysis, keep the resume and start a new
          tailoring session instead.
        </p>
      </ConfirmDialog>
    </div>
  );
}
