import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-card">
            <Compass className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-700">
            404
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-950">
            This page doesn&apos;t exist
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            The link may be outdated, or the page may have moved. Your saved
            resumes and review sessions are unaffected.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to={user ? '/app' : '/'}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-700 px-4 text-sm font-medium text-white transition hover:bg-accent-800"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {user ? 'Back to dashboard' : 'Back to home'}
            </Link>
            {!user ? (
              <Link
                to="/login"
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-ink-700 transition hover:bg-slate-50"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
