import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Database,
  FileLock2,
  LockKeyhole,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { Alert, Card, CardHeader, PageHeader } from '../components/ui.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

const SECTIONS = [
  {
    icon: UserRound,
    title: 'Account data',
    body: 'We store your name, email address, a bcrypt password hash, account status, and login timestamps. Authentication uses an httpOnly cookie. We do not run advertising trackers or third-party analytics in this app.',
  },
  {
    icon: FileLock2,
    title: 'Resume and job description data',
    body: 'Uploaded DOCX files, parsed paragraph text, pasted job descriptions, generated requirements, review decisions, and exported files are stored for your account. Files are addressed by generated storage keys and served only through authenticated, ownership-checked API routes.',
  },
  {
    icon: Sparkles,
    title: 'AI processing',
    body: 'With AI_PROVIDER=heuristic, analysis runs locally and no resume text leaves the server. If an administrator configures OpenAI or Anthropic, the relevant resume paragraphs and job description are sent to that provider to generate suggestions, subject to that provider’s terms and data policies. Server-side evidence and safety checks still validate every returned suggestion.',
  },
  {
    icon: Database,
    title: 'Retention and deletion',
    body: 'By default, resumes and generated artifacts expire after 30 days and are removed by the cleanup job. The operator can change this. Deleting a resume removes its original file, analysis sessions, suggestions, and generated exports from the configured storage and database.',
  },
  {
    icon: LockKeyhole,
    title: 'Security measures',
    body: 'The app applies account-scoped authorization, private storage keys, upload type and size limits, DOCX package validation, request rate limiting, security headers, and ownership checks on every download. Files are hashed for integrity. Transport encryption depends on serving the app over HTTPS in deployment.',
  },
  {
    icon: ServerCog,
    title: 'Self-hosted operation',
    body: 'This is a self-hosted application. The person or organization running the server controls the database, storage, logs, backups, retention settings, and any configured AI provider. Contact that operator for access, correction, or deletion requests beyond the in-app controls.',
  },
];

export default function PrivacyPage({ standalone = false }) {
  usePageTitle('Privacy and data handling');

  const content = (
    <div className="space-y-6">
      {standalone ? (
        <PageHeader
          eyebrow="Privacy"
          title="Privacy and data handling"
          description="A plain-language description of what this self-hosted app stores, how analysis works, and what you can delete."
        />
      ) : null}

      <Alert variant="info" title="Short version">
        Your resume, job descriptions, suggestions, and exports are private to
        your account. The default local analyzer makes no external AI calls. You
        can delete a resume and every artifact generated from it at any time.
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title} className="p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
              <section.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-ink-900">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{section.body}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="What this app does not do" icon={ShieldCheck} />
        <ul className="list-disc space-y-2 p-5 pl-9 text-sm leading-relaxed text-ink-600">
          <li>It does not sell resume content or use it for advertising.</li>
          <li>It does not submit job applications or contact employers for you.</li>
          <li>It does not guarantee interview, ATS, or hiring outcomes.</li>
          <li>It does not alter your original DOCX in place; exports are separate copies.</li>
          <li>It does not use your resume content to train a model in local heuristic mode.</li>
        </ul>
      </Card>

      <Card>
        <CardHeader title="Controls available to you" icon={Trash2} />
        <div className="space-y-3 p-5 text-sm leading-relaxed text-ink-600">
          <p>
            <span className="font-medium text-ink-900">Delete a resume:</span> open
            the resume from your dashboard and choose Delete. This removes the
            original file, sessions, suggestions, and generated exports.
          </p>
          <p>
            <span className="font-medium text-ink-900">Sign out:</span> clears the
            authentication cookie in your browser.
          </p>
          <p>
            <span className="font-medium text-ink-900">Retention:</span> generated
            files and source documents may expire automatically. Expired downloads
            must be regenerated from the review decisions before expiry.
          </p>
        </div>
      </Card>

      <p className="text-[11px] leading-relaxed text-ink-400">
        This notice describes the behavior implemented in this repository. It is
        not a substitute for your organization’s legal or compliance review.
        Deployment operators are responsible for configuring HTTPS, durable
        storage, backups, retention, and any external AI provider agreements.
      </p>
    </div>
  );

  if (!standalone) return content;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo />
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-950">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">{content}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 py-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>AI Resume Tailor · Privacy notice</span>
          <span>Local analyzer makes no external AI calls by default.</span>
        </div>
      </footer>
    </div>
  );
}
