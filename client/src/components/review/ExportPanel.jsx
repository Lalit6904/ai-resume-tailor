import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import {
  api,
  downloadBlob,
  fetchBlobUrl,
  getApiError,
} from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatBytes, formatDate, labelForStatus, titleCase } from '../../utils/format.js';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  LoadingBlock,
  ProgressBar,
  StatusBadge,
} from '../ui.jsx';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-ink-950">{value}</p>
      {hint ? <p className="text-[10px] text-ink-400">{hint}</p> : null}
    </div>
  );
}

export default function ExportPanel({ resumeId, sessionId, editVersion, summary, onGoToReview }) {
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [stale, setStale] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(editVersion);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [starting, setStarting] = useState(false);
  const [statusError, setStatusError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  const approvedCount = (summary?.approved || 0) + (summary?.modified || 0);
  const excludedPending = summary?.pending || 0;
  const excludedRejected = summary?.rejected || 0;

  const loadStatus = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoadingStatus(true);
      try {
        const response = await api.get(`/resumes/${resumeId}/export-status`);
        const found = response.data.data.export;
        if (found && String(found.sessionId) === String(sessionId)) {
          setRecord(found);
          setStale(Boolean(response.data.data.stale));
          setCurrentVersion(response.data.data.currentEditVersion ?? editVersion);
          setStatusError(null);
        } else {
          setRecord(null);
          setStale(false);
        }
      } catch (err) {
        setStatusError(getApiError(err, 'Unable to check export status.'));
      } finally {
        setLoadingStatus(false);
      }
    },
    [resumeId, sessionId, editVersion],
  );

  useEffect(() => {
    loadStatus({ silent: true });
  }, [loadStatus, editVersion]);

  useEffect(() => {
    if (record?.status !== 'processing') return undefined;
    const timer = setInterval(() => loadStatus({ silent: true }), 1400);
    return () => clearInterval(timer);
  }, [record?.status, loadStatus]);

  useEffect(() => {
    if (!record || record.status !== 'ready') {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);

    (async () => {
      try {
        const response = await api.get(`/resumes/${resumeId}/preview`, {
          params: { exportId: record.id },
        });
        if (cancelled) return;
        const data = response.data.data;
        if (data.mode === 'pdf') {
          objectUrl = await fetchBlobUrl(
            `/resumes/${resumeId}/preview/pdf?exportId=${encodeURIComponent(record.id)}`,
          );
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setPreview({ ...data, objectUrl });
        } else {
          setPreview(data);
        }
      } catch (err) {
        if (!cancelled) setPreviewError(getApiError(err, 'Unable to load the preview.'));
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [record?.id, record?.status, resumeId, previewAttempt]);

  const isStale = useMemo(
    () => Boolean(record && (stale || record.sourceEditVersion !== editVersion)),
    [record, stale, editVersion],
  );

  async function startExport() {
    setStarting(true);
    setStatusError(null);
    try {
      const response = await api.post(`/resumes/${resumeId}/export`, { sessionId });
      setRecord(response.data.data.export);
      setStale(false);
      setPreview(null);
      toast.info('Export queued. The server will validate the generated document.');
    } catch (err) {
      const apiError = getApiError(err, 'Unable to start the export.');
      setStatusError(apiError);
      toast.error(apiError.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleDownload() {
    if (!record) return;
    setDownloading(true);
    try {
      const filename = await downloadBlob(
        `/resumes/${resumeId}/download?exportId=${encodeURIComponent(record.id)}`,
        record.filename,
      );
      toast.success(`Downloaded ${filename}.`);
    } catch (err) {
      toast.error(getApiError(err, 'Unable to download the export.').message);
    } finally {
      setDownloading(false);
    }
  }

  const checks = record?.validation?.checks || [];
  const warnings = record?.validation?.warnings || [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Create a reviewed DOCX export"
          description="Only approved and edited suggestions are applied. Pending and rejected suggestions are excluded."
          icon={FileCheck2}
          action={
            record?.status === 'ready' ? (
              <StatusBadge status="ready" />
            ) : record?.status === 'processing' ? (
              <StatusBadge status="processing" />
            ) : record?.status === 'failed' ? (
              <StatusBadge status="failed" />
            ) : null
          }
        />

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Approved" value={approvedCount} hint="Included in export" />
            <Stat label="Pending" value={excludedPending} hint="Excluded" />
            <Stat label="Rejected" value={excludedRejected} hint="Excluded" />
            <Stat
              label="Review version"
              value={record?.sourceEditVersion ?? editVersion}
              hint={record ? `Current v${editVersion}` : 'No export yet'}
            />
          </div>

          {isStale ? (
            <Alert variant="warning" title="This export is out of date">
              Your review decisions changed after this file was generated
              {record?.sourceEditVersion != null
                ? ` (export v${record.sourceEditVersion}, current v${editVersion})`
                : ''}
              . Generate a fresh export so the download reflects only your latest
              approved changes.
            </Alert>
          ) : null}

          {statusError ? (
            <Alert variant="danger" title="Export problem">
              {statusError.message}
            </Alert>
          ) : null}

          {record?.status === 'failed' ? (
            <Alert variant="danger" title="Export blocked">
              {record.error?.message ||
                'The generated document did not pass validation and was not made available. Your original resume is unchanged.'}
            </Alert>
          ) : null}

          {loadingStatus && !record ? (
            <LoadingBlock label="Checking for an existing export…" className="min-h-[120px]" />
          ) : record?.status === 'processing' ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-sky-900">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                Building and validating your document…
              </div>
              <ProgressBar value={72} className="mt-3" label="Export pipeline (approximate)" />
              <p className="mt-2 text-xs leading-relaxed text-sky-800">
                The server is checking package integrity, preserved parts, edited
                paragraph text, and approved-only application. This page polls for
                the real result.
              </p>
            </div>
          ) : record?.status === 'ready' ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-emerald-950">Export validated and ready</p>
                <p className="mt-0.5 break-all text-xs text-emerald-800">
                  {record.filename} · {formatBytes(record.sizeBytes)} ·{' '}
                  {formatDate(record.createdAt, { withTime: true })}
                </p>
              </div>
              <Button onClick={handleDownload} loading={downloading} size="sm">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download DOCX
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={startExport}
                loading={starting}
                disabled={approvedCount === 0}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Regenerate
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">
                    {approvedCount > 0
                      ? `${approvedCount} approved change${approvedCount === 1 ? '' : 's'} ready to apply`
                      : 'No approved changes yet'}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                    {approvedCount > 0
                      ? 'The server edits a copy of your original DOCX and runs integrity checks before offering the file.'
                      : 'Accept or edit at least one suggestion before exporting.'}
                  </p>
                </div>
                {approvedCount > 0 ? (
                  <Button onClick={startExport} loading={starting}>
                    <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                    Generate DOCX
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={onGoToReview}>
                    Review suggestions
                  </Button>
                )}
              </div>
            </div>
          )}

          {record?.status === 'ready' ? (
            <p className="text-[11px] leading-relaxed text-ink-400">
              Expires {record.expiresAt ? formatDate(record.expiresAt) : 'when retention cleanup runs'}.
              The file is stored privately and can be regenerated at any time from
              your reviewed decisions.
            </p>
          ) : null}
        </div>
      </Card>

      {record?.status === 'ready' ? (
        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Preview of the exported document"
              description={
                preview?.mode === 'pdf'
                  ? 'Rendered by LibreOffice from the validated DOCX.'
                  : 'Approximate HTML content preview generated from the validated DOCX.'
              }
              icon={Eye}
              action={preview?.mode ? <Badge variant={preview.mode === 'pdf' ? 'success' : 'warning'}>{preview.mode === 'pdf' ? 'PDF render' : 'HTML fallback'}</Badge> : null}
            />
            <div className="p-4">
              {previewLoading ? (
                <LoadingBlock label="Loading preview…" />
              ) : previewError ? (
                <Alert variant="warning" title="Preview unavailable">
                  {previewError.message} You can still download the validated DOCX.
                  <div className="mt-2">
                    <Button size="sm" variant="secondary" onClick={() => setPreviewAttempt((value) => value + 1)}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      Try preview again
                    </Button>
                  </div>
                </Alert>
              ) : preview?.mode === 'pdf' && preview.objectUrl ? (
                <iframe
                  src={preview.objectUrl}
                  title="PDF preview of the exported resume"
                  className="pdf-frame"
                />
              ) : preview?.html ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  {/* Server-generated, sanitized HTML from the validated export. */}
                  <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                </div>
              ) : (
                <p className="text-sm text-ink-500">No preview content was returned.</p>
              )}

              {preview?.note ? (
                <p className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {preview.note}
                </p>
              ) : null}

              {preview?.mode === 'html' ? (
                <Alert variant="warning" className="mt-3" title="Layout is approximate">
                  LibreOffice is not available, so this preview is reconstructed
                  from document text and basic formatting. Word may paginate,
                  reflow, and position content differently. Open the downloaded
                  DOCX for the authoritative layout.
                </Alert>
              ) : null}
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Validation checks" icon={ShieldCheck} />
              <div className="p-4">
                {checks.length === 0 ? (
                  <p className="text-sm text-ink-500">No detailed checks were recorded.</p>
                ) : (
                  <ul className="space-y-2">
                    {checks.map((check) => (
                      <li key={check.name} className="flex gap-2 text-xs leading-relaxed">
                        {check.passed ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                        )}
                        <div>
                          <p className="font-medium text-ink-800">{titleCase(check.name)}</p>
                          {check.details ? <p className="text-ink-500">{check.details}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Document facts" icon={FileText} />
              <dl className="space-y-2.5 p-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Format</dt>
                  <dd className="font-medium text-ink-800">DOCX (OOXML)</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Applied edits</dt>
                  <dd className="font-medium text-ink-800">{record.appliedEditIds?.length || 0}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Renderer</dt>
                  <dd className="font-medium text-ink-800">
                    {record.validation?.renderer === 'libreoffice' ? 'LibreOffice' : 'HTML fallback'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">Pages</dt>
                  <dd className="font-medium text-ink-800">
                    {record.validation?.pageCount ?? 'Not measured'}
                    {record.validation?.originalPageCount
                      ? ` (was ${record.validation.originalPageCount})`
                      : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-500">SHA-256</dt>
                  <dd className="max-w-[160px] truncate font-mono text-[10px] text-ink-500" title={record.sha256}>
                    {record.sha256}
                  </dd>
                </div>
              </dl>
            </Card>

            {warnings.length ? (
              <Card>
                <CardHeader title="Review notes" icon={TriangleAlert} />
                <ul className="space-y-2 p-4">
                  {warnings.map((warning) => (
                    <li key={warning} className="flex gap-2 text-xs leading-relaxed text-amber-800">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {warning}
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {record?.status === 'failed' && checks.length ? (
        <Card>
          <CardHeader title="Validation details" icon={ShieldAlert} />
          <ul className="space-y-2 p-5">
            {checks.map((check) => (
              <li key={check.name} className="flex gap-2 text-xs leading-relaxed">
                {check.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" aria-hidden="true" />
                )}
                <div>
                  <p className="font-medium text-ink-800">{titleCase(check.name)}</p>
                  {check.details ? <p className="text-ink-500">{check.details}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Alert variant="warning" title="Before you send it">
        Open the downloaded DOCX in Word and review every page. Longer or shorter
        replacements can reflow bullets, tables, and page breaks even when the
        document package and formatting are preserved. Also confirm that every
        statement is still accurate and that you can discuss it in an interview.
      </Alert>
    </div>
  );
}
