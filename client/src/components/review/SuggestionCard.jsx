import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleCheck,
  Info,
  Pencil,
  RotateCcw,
  TriangleAlert,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Badge, Button, StatusBadge, TextArea } from '../ui.jsx';
import { labelForStatus } from '../../utils/format.js';

const RISK_VARIANTS = { low: 'success', medium: 'warning', high: 'danger' };

export default function SuggestionCard({ edit, busy, onAction }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(edit.finalText || edit.proposedText);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!editing) setText(edit.finalText || edit.proposedText);
  }, [edit.finalText, edit.proposedText, editing]);

  const isModified = edit.status === 'modified';
  const effective = isModified && edit.finalText ? edit.finalText : edit.proposedText;

  async function act(action, payload) {
    const result = await onAction(edit, action, payload);
    return result;
  }

  async function saveEdit() {
    if (!text.trim()) return;
    const ok = await act('modify', text);
    if (ok !== false) setEditing(false);
  }

  return (
    <article
      className={clsx(
        'overflow-hidden rounded-xl border bg-white shadow-card transition-colors',
        edit.status === 'approved' || edit.status === 'modified'
          ? 'border-accent-200'
          : edit.status === 'rejected'
            ? 'border-slate-200 opacity-80'
            : 'border-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{edit.sectionName || 'General'}</Badge>
          <StatusBadge status={edit.status} />
          <Badge variant={RISK_VARIANTS[edit.risk] || 'neutral'}>
            {labelForStatus(edit.risk)} risk
          </Badge>
          {edit.validation?.formatting === 'partial' ? (
            <Badge variant="warning">Mixed formatting</Badge>
          ) : null}
        </div>
        <span className="text-[10px] text-ink-400">v{edit.version}</span>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
              Original text
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-600 line-through decoration-slate-300 decoration-1">
              {edit.originalText}
            </p>
          </div>

          <div
            className={clsx(
              'rounded-lg border p-3',
              isModified
                ? 'border-accent-200 bg-accent-50/50'
                : 'border-slate-200 bg-white',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">
                {isModified ? 'Your edited text' : 'Proposed text'}
              </p>
              {isModified ? <Badge variant="accent">Approved edit</Badge> : null}
            </div>
            {editing ? (
              <div className="mt-1.5">
                <TextArea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  className="min-h-[110px] text-sm"
                  maxLength={3000}
                  aria-label="Edit proposed text"
                />
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-ink-400">{text.length} / 3000</span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setText(edit.finalText || edit.proposedText);
                        setEditing(false);
                      }}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={saveEdit} loading={busy} disabled={!text.trim()}>
                      Save edit
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">{effective}</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <p className="text-xs leading-relaxed text-ink-600">
            <span className="font-semibold text-ink-800">Why this change: </span>
            {edit.reason}
          </p>
          {edit.evidence ? (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
              <span className="font-semibold text-ink-700">Evidence in your resume: </span>
              “{edit.evidence}”
            </p>
          ) : null}
          {edit.requirementIds?.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
                Addresses
              </span>
              {edit.requirementIds.map((id) => (
                <Badge key={id} variant="info">{id}</Badge>
              ))}
            </div>
          ) : null}
          {edit.validation?.warnings?.length ? (
            <div className="mt-2 space-y-1">
              {edit.validation.warnings.map((warning) => (
                <p key={warning} className="flex gap-1.5 text-xs leading-relaxed text-amber-800">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {showDetails ? (
          <div className="rounded-lg border border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
            <p><span className="font-medium text-ink-700">Target:</span> {edit.part} · {edit.locationId}</p>
            <p className="mt-0.5"><span className="font-medium text-ink-700">Validation:</span> {labelForStatus(edit.validation?.status || 'valid')} · formatting preservation {edit.validation?.formatting || 'full'}</p>
            {edit.ai?.provider ? (
              <p className="mt-0.5"><span className="font-medium text-ink-700">Generated by:</span> {edit.ai.provider} / {edit.ai.model}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setShowDetails((value) => !value)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-800"
          aria-expanded={showDetails}
        >
          <ChevronDown className={clsx('h-3.5 w-3.5 transition', showDetails && 'rotate-180')} aria-hidden="true" />
          {showDetails ? 'Hide details' : 'Suggestion details'}
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          {edit.status === 'pending' ? (
            <>
              <Button size="sm" onClick={() => act('accept')} disabled={busy} loading={busy}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Accept
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setEditing((value) => !value)}
                disabled={busy}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => act('reject')} disabled={busy}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reject
              </Button>
            </>
          ) : null}

          {edit.status === 'approved' ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => act('reset')} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Edit wording
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => act('reject')} disabled={busy}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reject
              </Button>
            </>
          ) : null}

          {edit.status === 'modified' ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => act('reset')} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Change wording
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => act('reject')} disabled={busy}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Reject
              </Button>
            </>
          ) : null}

          {edit.status === 'rejected' ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => act('reset')} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </Button>
              <Button size="sm" variant="secondary" onClick={() => act('accept')} disabled={busy}>
                <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Accept after all
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
