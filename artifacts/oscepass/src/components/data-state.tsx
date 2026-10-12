import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/api';

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return <div className="state-box" role="status" aria-live="polite" aria-busy="true">
    <div className="skeleton" style={{ height: 14, width: '60%', margin: '0 auto 12px' }} />
    <div className="skeleton" style={{ height: 14, width: '85%', margin: '0 auto 12px' }} />
    <div className="skeleton" style={{ height: 14, width: '45%', margin: '0 auto' }} />
    <span className="sr-only">{label}…</span>
  </div>;
}

export function LoadingGrid({ label = 'Loading' }: { label?: string }) {
  return <div className="case-grid" role="status" aria-live="polite" aria-busy="true">
    {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 300 }} />)}
    <span className="sr-only">{label}…</span>
  </div>;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status >= 500) return 'The server had a problem. Please try again in a moment.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <div className="state-box" role="alert">
    <AlertTriangle size={26} aria-hidden="true" />
    <h2>We couldn’t load this</h2>
    <p>{errorMessage(error)}</p>
    {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Try again</button>}
  </div>;
}

export function EmptyBlock({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="state-box"><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
