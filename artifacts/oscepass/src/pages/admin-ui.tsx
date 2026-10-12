import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ImageUp, Trash2 } from 'lucide-react';
import { ApiError, imageOf, request } from '@/lib/api';
import { errorMessage } from '@/components/data-state';

export type Notice = { type: 'ok' | 'err'; text: string };
export type Notify = (notice: Notice) => void;

export function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const replaceAt = <T,>(list: T[], index: number, value: T): T[] => list.map((item, i) => (i === index ? value : item));
export const removeAt = <T,>(list: T[], index: number): T[] => list.filter((_, i) => i !== index);

export function slugify(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Turns API failures into messages an editor can act on. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Please sign in again.';
    if (error.status === 409) return 'That slug is already used by another item. Choose a different slug.';
    if (error.status === 400 && error.issues.length) {
      return `Please fix: ${error.issues.slice(0, 6).map((issue) => `${issue.path.join(' › ') || 'form'}: ${issue.message}`).join('; ')}`;
    }
    if (error.status === 400) return error.message === 'Referenced course or group does not exist' ? 'The selected course or topic group no longer exists. Pick another one.' : error.message;
    if (error.status === 413) return error.message;
    if (error.status === 429) return error.message;
  }
  return errorMessage(error);
}

export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`adm-field${wide ? ' adm-wide' : ''}`}><span className="adm-label">{label}</span>{children}{hint && <span className="adm-hint">{hint}</span>}</label>;
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="adm-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

export function ItemControls({ index, count, onMove, onRemove, label }: { index: number; count: number; onMove: (direction: -1 | 1) => void; onRemove: () => void; label: string }) {
  return <div className="adm-controls">
    <button type="button" className="adm-icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${label} up`}><ArrowUp size={15} aria-hidden="true" /></button>
    <button type="button" className="adm-icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${label} down`}><ArrowDown size={15} aria-hidden="true" /></button>
    <button type="button" className="adm-icon adm-danger" onClick={onRemove} aria-label={`Remove ${label}`}><Trash2 size={15} aria-hidden="true" /></button>
  </div>;
}

export function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: { title: string; message: string; confirmLabel: string; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const latestCancel = useRef(onCancel);
  latestCancel.current = onCancel;
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') latestCancel.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return <div className="adm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="adm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="adm-confirm-title" aria-describedby="adm-confirm-text">
      <h2 id="adm-confirm-title">{title}</h2><p id="adm-confirm-text">{message}</p>
      <div className="adm-row-actions"><button type="button" className="btn btn-light" ref={cancelRef} onClick={onCancel}>Cancel</button>
        <button type="button" className="btn adm-btn-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button></div>
    </div></div>;
}

const MAX_IMAGE = 10 * 1024 * 1024;

export function ImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Use a PNG, JPEG or WebP image.'); return; }
    if (file.size > MAX_IMAGE) { setError('The image must be 10 MB or smaller.'); return; }
    setBusy(true);
    try {
      const upload = await request<{ uploadURL: string; objectPath: string }>('/admin/media/upload-url', { method: 'POST', body: { filename: file.name, mimeType: file.type, size: file.size } });
      const stored = await fetch(upload.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!stored.ok) throw new Error('The image could not be uploaded to file storage.');
      const result = await request<{ url: string }>('/admin/media', { method: 'POST', body: { filename: file.name, mimeType: file.type, size: file.size, objectPath: upload.objectPath } });
      onChange(result.url);
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <div className="adm-image">
    <img src={imageOf(value)} alt="" className="adm-thumb" />
    <div className="adm-image-fields">
      <label className="adm-field"><span className="adm-label">Image URL</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="/brand/t1.jpg or an uploaded image" /></label>
      <label className="btn btn-light adm-upload"><ImageUp size={15} aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload image'}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      {error && <p className="adm-error" role="alert">{error}</p>}
    </div>
  </div>;
}
