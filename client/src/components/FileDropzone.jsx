import { useId, useRef, useState } from 'react';
import { FileText, UploadCloud, X } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes } from '../utils/format.js';
import { Button } from './ui.jsx';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function validateResumeFile(file) {
  if (!file) return 'Choose a resume file.';
  if (!/\.docx$/i.test(file.name || '')) {
    return 'Only Word .docx files are supported. Save .doc or PDF files as .docx and try again.';
  }
  if (file.size === 0) return 'This file is empty. Choose a different .docx file.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'This file is larger than 10 MB. Compress the images or choose a smaller DOCX file.';
  }
  return null;
}

export default function FileDropzone({ file, onSelect, onClear, disabled = false, error }) {
  const inputId = useId();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState(null);

  function choose(nextFile) {
    if (disabled) return;
    const message = validateResumeFile(nextFile);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(null);
    onSelect(nextFile);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const nextFile = event.dataTransfer.files?.[0];
    if (nextFile) choose(nextFile);
  }

  const shownError = error || localError;

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging
            ? 'border-accent-500 bg-accent-50/60'
            : 'border-slate-300 bg-white hover:border-slate-400',
          disabled && 'cursor-not-allowed opacity-60',
          shownError && 'border-rose-300 bg-rose-50/30',
        )}
      >
        {file ? (
          <>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="max-w-full break-all text-sm font-semibold text-ink-900">{file.name}</p>
            <p className="mt-1 text-xs text-ink-500">{formatBytes(file.size)} · DOCX</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
              >
                Choose a different file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLocalError(null);
                  onClear?.();
                  if (inputRef.current) inputRef.current.value = '';
                }}
                disabled={disabled}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Remove
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-ink-500">
              <UploadCloud className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold text-ink-900">
              Drop your DOCX resume here, or{' '}
              <label
                htmlFor={inputId}
                className="cursor-pointer text-accent-700 underline decoration-accent-300 underline-offset-2 hover:text-accent-900"
              >
                browse files
              </label>
            </p>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-ink-500">
              Word .docx only · up to 10 MB · PDF and legacy .doc are not supported
            </p>
          </>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) choose(nextFile);
          }}
        />
      </div>
      {shownError ? (
        <p className="mt-2 text-xs font-medium text-rose-700" role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
