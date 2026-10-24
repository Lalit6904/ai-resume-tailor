export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function formatRelative(value) {
  if (!value) return '—';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'minute') {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return formatDate(value);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function labelForStatus(status) {
  const labels = {
    queued: 'Queued',
    analyzing: 'Analyzing',
    completed: 'Analysis ready',
    failed: 'Failed',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    modified: 'Edited & approved',
    processing: 'Exporting',
    ready: 'Ready',
    expired: 'Expired',
    passed: 'Passed',
    warning: 'Review note',
    demonstrated: 'Supported',
    partially_demonstrated: 'Partially supported',
    not_evidenced: 'Not evidenced',
    low: 'Low risk',
    medium: 'Medium risk',
    high: 'High risk',
    valid: 'Validated',
  };
  return labels[status] || status;
}

export function titleCase(value = '') {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
