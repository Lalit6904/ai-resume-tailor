import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileCheck2,
  Lock,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { api, getApiError } from '../services/api.js';
import FileDropzone from '../components/FileDropzone.jsx';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  PageHeader,
  ProgressBar,
} from '../components/ui.jsx';
import { useToast } from '../context/ToastContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

const NEXT_STEPS = [
  {
    icon: ScanSearch,
    title: 'Parse and map',
    body: 'Paragraphs, tables, headers, footers, and formatting are inspected. Unsafe targets are marked read-only.',
  },
  {
    icon: Lock,
    title: 'Store privately',
    body: 'The original file is stored under a generated key scoped to your account — never in a public folder.',
  },
  {
    icon: Sparkles,
    title: 'Ready for a job description',
    body: 'After upload you can paste a role and start an analysis. Nothing is changed until you approve it.',
  },
];

export default function UploadPage() {
  usePageTitle('Upload resume');
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [submitting, setSubmitting] = useState(false);

  const busy = phase === 'uploading' || phase === 'parsing';

  async function handleUpload() {
    if (!file || busy) return;
    setError(null);
    setSubmitting(true);
    setProgress(0);
    setPhase('uploading');

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await api.post('/resumes', formData, {
        timeout: 120000,
        onUploadProgress(event) {
          if (!event.total) return;
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setProgress(percent);
          if (percent >= 99) setPhase('parsing');
        },
      });
      setPhase('parsing');
      setProgress(100);
      const resume = response.data.data.resume;
      toast.success('Resume uploaded and parsed.');
      navigate(`/app/resumes/${resume.id}`, { state: { newlyUploaded: true } });
    } catch (err) {
      const apiError = getApiError(err, 'The resume could not be uploaded.');
      setError(apiError);
      setPhase('idle');
      setProgress(0);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Step 1"
        title="Upload your resume"
        description="Choose the DOCX file you already use. We parse a copy for structure and keep the original untouched."
      />

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader
            title="Word document"
            description="Only .docx files are accepted. PDF, .doc, and image files cannot preserve formatting."
            icon={FileCheck2}
          />
          <div className="space-y-5 p-5">
            <FileDropzone
              file={file}
              error={error?.message}
              onSelect={(nextFile) => {
                setFile(nextFile);
                setError(null);
                setPhase('idle');
                setProgress(0);
              }}
              onClear={() => {
                setFile(null);
                setError(null);
                setPhase('idle');
                setProgress(0);
              }}
              disabled={busy}
            />

            {error ? (
              <Alert variant="danger" title="Upload failed">
                {error.message}
                {error.code === 'UNSUPPORTED_FILE_TYPE' || error.code === 'INVALID_DOCX' ? (
                  <p className="mt-1.5 text-xs">
                    Tip: open the file in Word and use “Save As” → Word Document (.docx).
                  </p>
                ) : null}
              </Alert>
            ) : null}

            {busy ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <ProgressBar
                  value={progress}
                  label={phase === 'uploading' ? 'Uploading your DOCX' : 'Parsing document structure'}
                />
                <p className="mt-2 text-xs leading-relaxed text-ink-500">
                  {phase === 'uploading'
                    ? 'Sending the file over an encrypted connection.'
                    : 'The server is validating the DOCX package and mapping paragraphs. Large documents may take a few seconds.'}
                </p>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-ink-400">
                By uploading, you confirm you have the right to use this document.
              </p>
              <Button
                onClick={handleUpload}
                disabled={!file || busy}
                loading={submitting}
                className="sm:min-w-[150px]"
              >
                <UploadCloud className="h-4 w-4" aria-hidden="true" />
                {busy ? 'Working…' : 'Upload and parse'}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="What happens next" icon={ArrowRight} />
            <ul className="divide-y divide-slate-100">
              {NEXT_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                    <step.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink-900">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{step.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Alert variant="info" title="Formatting limits are real">
            DOCX editing preserves the package and paragraph formatting, but Word
            can still reflow text when a replacement is longer or shorter. Review
            the downloaded file before sending it anywhere.
          </Alert>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-ink-500">
              Private by design: no public file URLs, account-scoped downloads, and
              automatic retention cleanup. Read the{' '}
              <a href="/privacy" className="font-medium text-accent-700 underline underline-offset-2">
                privacy notice
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
