import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Check, Eye, EyeOff } from 'lucide-react';
import AuthLayout from '../components/AuthLayout.jsx';
import { Alert, Button, Field, TextInput } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import usePageTitle from '../hooks/usePageTitle.js';

function validate({ name, email, password, confirmPassword }) {
  if (!name.trim()) return 'Enter your name.';
  if (!email.trim()) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  if (password.length < 8) return 'Use at least 8 characters for your password.';
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter in your password.';
  if (!/[0-9]/.test(password)) return 'Include at least one number in your password.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}

export default function RegisterPage() {
  usePageTitle('Create account');
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from || '/app';

  if (!loading && user) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const message = validate({ name, email, password, confirmPassword });
    if (message) {
      setError(message);
      return;
    }
    setSubmitting(true);
    try {
      await register(name.trim(), email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to create your account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Create your workspace"
      description="A private place to tailor DOCX resumes against the roles you actually want."
      footer={
        <p className="mt-6 text-sm text-ink-500">
          Already have an account?{' '}
          <Link
            to="/login"
            state={location.state}
            className="font-medium text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-900"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error ? (
          <Alert variant="danger" title="Check your details">
            {error}
          </Alert>
        ) : null}

        <Field label="Name" htmlFor="register-name">
          <TextInput
            id="register-name"
            autoComplete="name"
            autoFocus
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Alex Morgan"
          />
        </Field>

        <Field label="Email" htmlFor="register-email">
          <TextInput
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="register-password"
          hint="At least 8 characters, including a letter and a number."
        >
          <div className="relative">
            <TextInput
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Create a password"
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400 transition hover:text-ink-700"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Field label="Confirm password" htmlFor="register-confirm">
          <TextInput
            id="register-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Repeat your password"
          />
        </Field>

        {password ? (
          <ul className="space-y-1 text-xs text-ink-500">
            <li className="flex items-center gap-1.5">
              <Check className={password.length >= 8 ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-ink-300'} aria-hidden="true" />
              8 or more characters
            </li>
            <li className="flex items-center gap-1.5">
              <Check className={/[A-Za-z]/.test(password) && /[0-9]/.test(password) ? 'h-3.5 w-3.5 text-emerald-600' : 'h-3.5 w-3.5 text-ink-300'} aria-hidden="true" />
              At least one letter and one number
            </li>
          </ul>
        ) : null}

        <Button
          type="submit"
          className="w-full"
          size="lg"
          loading={submitting}
          disabled={!name || !email || !password || !confirmPassword}
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
