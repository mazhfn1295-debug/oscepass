import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Download, Eye, LogOut, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { Link } from 'wouter';
import {
  ApiError, emptyContent, imageOf, normaliseContent, request,
  type Course, type PublishStatus, type StationContent, type StationDetail, type TopicGroup, type TopicItem,
} from '@/lib/api';
import { ErrorBlock, LoadingBlock } from '@/components/data-state';
import { StationView } from '@/components/station-view';
import { ContentEditor } from '@/pages/admin-content-editor';
import { Check, ConfirmDialog, Field, ImageField, ItemControls, describeError, move, removeAt, replaceAt, slugify, type Notice, type Notify } from '@/pages/admin-ui';
import { CourseAssetsTab } from '@/pages/admin-assets';

const ICONS = ['brain', 'book', 'video', 'clipboard', 'heart', 'stethoscope', 'graduation'];

/* ------------------------------------------------------------------ login */

function LoginForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try { await request('/admin/login', { method: 'POST', body: { username, password } }); onDone(); }
    catch (e) { setError(e instanceof ApiError && e.status === 401 ? 'Wrong username or password.' : describeError(e)); }
    finally { setBusy(false); }
  }
  return <main className="adm-login"><form className="adm-login-card" onSubmit={submit}>
    <span className="eyebrow">OSCEPASS admin</span><h1>Sign in</h1>
    <p className="adm-muted">This area is for the site owner only.</p>
    <Field label="Admin username"><input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></Field>
    <Field label="Password"><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <Link href="/" className="adm-muted">Back to the site</Link>
  </form></main>;
}

/* ---------------------------------------------------------------- helpers */

function StatusBadge({ status }: { status: PublishStatus }) {
  return <span className={`adm-badge adm-${status}`}>{status === 'published' ? 'Published' : 'Draft'}</span>;
}

function useAdminAction(notify: Notify) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, ok: string): Promise<boolean> {
    setBusy(true);
    try { await action(); await qc.invalidateQueries(); notify({ type: 'ok', text: ok }); return true; }
    catch (e) { notify({ type: 'err', text: describeError(e) }); return false; }
    finally { setBusy(false); }
  }
  return { run, busy };
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

function Preview({ station, onClose }: { station: StationDetail; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return <div className="adm-preview" role="dialog" aria-modal="true" aria-label="Station preview">
    <div className="adm-preview-bar"><strong>Preview</strong><span>Students see this only when the station is published.</span>
      <button type="button" className="btn btn-light" onClick={onClose}><X size={15} aria-hidden="true" /> Close preview</button></div>
    <div className="adm-preview-body"><StationView station={station} preview /></div>
  </div>;
}

/* ---------------------------------------------------------- station form */

interface StationDraft {
  title: string; slug: string; courseId: number | null; groupId: number | null; category: string; summary: string;
  imageUrl: string; status: PublishStatus; featured: boolean; showOnHome: boolean; sortOrder: number; content: StationContent;
}

function toDraft(station: StationDetail | null, courses: Course[]): StationDraft {
  return station
    ? { title: station.title, slug: station.slug, courseId: station.courseId, groupId: station.groupId, category: station.category, summary: station.summary, imageUrl: station.imageUrl ?? '', status: station.status, featured: station.featured, showOnHome: station.showOnHome, sortOrder: station.sortOrder, content: normaliseContent(station.content) }
    : { title: '', slug: '', courseId: courses[0]?.id ?? null, groupId: null, category: '', summary: '', imageUrl: '', status: 'draft', featured: false, showOnHome: false, sortOrder: 0, content: emptyContent() };
}

function StationForm({ station, courses, groups, onClose, notify }: { station: StationDetail | null; courses: Course[]; groups: TopicGroup[]; onClose: () => void; notify: Notify }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(() => toDraft(station, courses));
  const [slugTouched, setSlugTouched] = useState(Boolean(station));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const set = <K extends keyof StationDraft>(key: K, value: StationDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const courseGroups = groups.filter((group) => group.courseId === draft.courseId);

  const asStation = (): StationDetail => ({
    id: station?.id ?? 0, slug: draft.slug || 'preview', courseId: draft.courseId ?? 0, groupId: draft.groupId, title: draft.title || 'Untitled station',
    category: draft.category, summary: draft.summary, imageUrl: draft.imageUrl || null, status: draft.status, featured: draft.featured,
    showOnHome: draft.showOnHome, sortOrder: draft.sortOrder, content: draft.content,
  });

  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (draft.courseId === null) { setError('Create a course first, then choose it here.'); return; }
    setBusy(true);
    const body = { slug: draft.slug, courseId: draft.courseId, groupId: draft.groupId, title: draft.title, category: draft.category, summary: draft.summary, imageUrl: draft.imageUrl || null, status: draft.status, featured: draft.featured, showOnHome: draft.showOnHome, sortOrder: draft.sortOrder, content: draft.content };
    try {
      await request(station ? `/admin/stations/${station.id}` : '/admin/stations', { method: station ? 'PUT' : 'POST', body });
      await qc.invalidateQueries();
      notify({ type: 'ok', text: `“${draft.title}” saved as ${draft.status}.` });
      onClose();
    } catch (e) { setError(describeError(e)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    finally { setBusy(false); }
  }

  return <form className="adm-form" onSubmit={save}>
    <div className="adm-form-head"><h2>{station ? 'Edit station' : 'New station'}</h2><button type="button" className="btn btn-light" onClick={onClose}>Back to list</button></div>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <div className="adm-grid">
      <Field label="Title"><input value={draft.title} required onChange={(event) => { set('title', event.target.value); if (!slugTouched) set('slug', slugify(event.target.value)); }} /></Field>
      <Field label="Slug" hint="Lowercase letters, numbers and dashes. It becomes the page address."><input value={draft.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(event) => { setSlugTouched(true); set('slug', event.target.value); }} /></Field>
      <Field label="Course"><select value={draft.courseId ?? ''} onChange={(event) => { set('courseId', Number(event.target.value) || null); set('groupId', null); }} required><option value="" disabled>Choose a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></Field>
      <Field label="Topic group"><select value={draft.groupId ?? ''} onChange={(event) => set('groupId', event.target.value ? Number(event.target.value) : null)}><option value="">No group</option>{courseGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
      <Field label="Category" hint="Used for the topic filter on the practice page."><input value={draft.category} onChange={(event) => set('category', event.target.value)} /></Field>
      <Field label="Status"><select value={draft.status} onChange={(event) => set('status', event.target.value as PublishStatus)}><option value="draft">Draft (hidden from students)</option><option value="published">Published</option></select></Field>
      <Field label="Summary" wide><textarea rows={2} value={draft.summary} onChange={(event) => set('summary', event.target.value)} /></Field>
      <div className="adm-wide"><span className="adm-label">Cover image</span><ImageField value={draft.imageUrl} onChange={(url) => set('imageUrl', url)} /></div>
      <div className="adm-wide adm-checks"><Check label="Featured" checked={draft.featured} onChange={(v) => set('featured', v)} /><Check label="Show on the home page" checked={draft.showOnHome} onChange={(v) => set('showOnHome', v)} /></div>
    </div>
    <h3>Station content</h3>
    <ContentEditor value={draft.content} onChange={(content) => set('content', content)} />
    <div className="adm-sticky-actions">
      <button type="button" className="btn btn-light" onClick={() => setPreviewing(true)}><Eye size={15} aria-hidden="true" /> Preview</button>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : `Save as ${draft.status}`}</button>
    </div>
    {previewing && <Preview station={asStation()} onClose={() => setPreviewing(false)} />}
  </form>;
}

/* ---------------------------------------------------------- stations tab */

function StationsTab({ stations, courses, groups, notify }: { stations: StationDetail[]; courses: Course[]; groups: TopicGroup[]; notify: Notify }) {
  const qc = useQueryClient();
  const { run, busy } = useAdminAction(notify);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PublishStatus>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<StationDetail | 'new' | null>(null);
  const [preview, setPreview] = useState<StationDetail | null>(null);
  const [toDelete, setToDelete] = useState<StationDetail | null>(null);
  const [importing, setImporting] = useState(false);

  const ordered = useMemo(() => [...stations].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [stations]);
  const query = search.trim().toLowerCase();
  const visible = ordered.filter((s) => (statusFilter === 'all' || s.status === statusFilter) && (!query || `${s.title} ${s.slug} ${s.category}`.toLowerCase().includes(query)));
  const canReorder = !query && statusFilter === 'all';
  const courseName = (id: number) => courses.find((c) => c.id === id)?.title ?? '—';

  if (editing) return <StationForm station={editing === 'new' ? null : editing} courses={courses} groups={groups} notify={notify} onClose={() => setEditing(null)} />;

  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  const reorder = (index: number, direction: -1 | 1) => {
    const next = move(ordered, index, direction);
    void run(() => request('/admin/reorder', { method: 'POST', body: { table: 'stations', ids: next.map((s) => s.id) } }), 'Order saved.');
  };
  const setStatus = (status: PublishStatus) => {
    const ids = [...selected];
    void run(() => request('/admin/status', { method: 'POST', body: { table: 'stations', ids, status } }), `${ids.length} ${ids.length === 1 ? 'station' : 'stations'} ${status === 'published' ? 'published' : 'moved to draft'}.`).then((ok) => { if (ok) setSelected(new Set()); });
  };

  function exportAll() {
    download(`oscepass-stations-${new Date().toISOString().slice(0, 10)}.json`, ordered.map((s) => ({
      courseSlug: courses.find((c) => c.id === s.courseId)?.slug ?? null, group: groups.find((g) => g.id === s.groupId)?.name ?? null,
      slug: s.slug, title: s.title, category: s.category, summary: s.summary, imageUrl: s.imageUrl, status: s.status,
      featured: s.featured, showOnHome: s.showOnHome, sortOrder: s.sortOrder, content: s.content,
    })));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    const problems: string[] = [];
    let done = 0;
    try {
      const parsed = JSON.parse(await file.text());
      const list: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.stations) ? parsed.stations : [];
      if (!list.length) throw new Error('No stations found in this file.');
      for (const item of list) {
        const slug = String(item.slug ?? '');
        const course = courses.find((c) => c.slug === item.courseSlug) ?? (courses.length === 1 ? courses[0] : undefined);
        if (!course) { problems.push(`${slug || 'a station'}: unknown course`); continue; }
        const group = groups.find((g) => g.courseId === course.id && g.name === item.group);
        const body = { slug, courseId: course.id, groupId: group?.id ?? null, title: String(item.title ?? ''), category: String(item.category ?? ''), summary: String(item.summary ?? ''), imageUrl: item.imageUrl ? String(item.imageUrl) : null, status: item.status === 'published' ? 'published' : 'draft', featured: Boolean(item.featured), showOnHome: Boolean(item.showOnHome), sortOrder: Number(item.sortOrder) || 0, content: normaliseContent(item.content as Partial<StationContent>) };
        const existing = stations.find((s) => s.slug === slug);
        try { await request(existing ? `/admin/stations/${existing.id}` : '/admin/stations', { method: existing ? 'PUT' : 'POST', body }); done += 1; }
        catch (e) { problems.push(`${slug || 'a station'}: ${describeError(e)}`); }
      }
      notify({ type: problems.length ? 'err' : 'ok', text: `Imported ${done} of ${list.length} stations.${problems.length ? ` Problems: ${problems.slice(0, 4).join(' | ')}` : ''}` });
    } catch (e) { notify({ type: 'err', text: e instanceof SyntaxError ? 'That file is not valid JSON.' : describeError(e) }); }
    finally { setImporting(false); await qc.invalidateQueries(); }
  }

  return <section aria-label="Stations">
    <div className="adm-toolbar">
      <input className="adm-search" type="search" placeholder="Search title, slug or category" aria-label="Search stations" value={search} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PublishStatus)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select>
      <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} aria-hidden="true" /> New station</button>
      <button type="button" className="btn btn-light" onClick={exportAll} disabled={!stations.length}><Download size={15} aria-hidden="true" /> Export JSON</button>
      <label className="btn btn-light adm-upload"><Upload size={15} aria-hidden="true" /> {importing ? 'Importing…' : 'Import JSON'}<input type="file" accept="application/json,.json" className="sr-only" disabled={importing} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
    </div>
    {selected.size > 0 && <div className="adm-bulk" role="region" aria-label="Bulk actions"><strong>{selected.size} selected</strong>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('published')}>Publish</button>
      <button type="button" className="btn btn-light" disabled={busy} onClick={() => setStatus('draft')}>Hide (draft)</button>
      <button type="button" className="btn btn-light" onClick={() => setSelected(new Set())}>Clear selection</button></div>}
    {!canReorder && ordered.length > 1 && <p className="adm-muted">Clear the search and status filter to reorder stations.</p>}
    {ordered.length === 0 ? <div className="state-box"><h3>No stations yet</h3><p>Create your first station, or import a JSON export.</p></div>
      : visible.length === 0 ? <div className="state-box"><h3>No stations match</h3><p>Try a different search or status.</p></div>
        : <div className="adm-table-wrap"><table className="adm-table"><thead><tr>
          <th scope="col"><input type="checkbox" aria-label="Select all shown stations" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))} /></th>
          <th scope="col">Station</th><th scope="col">Course</th><th scope="col">Status</th><th scope="col">Order</th><th scope="col">Actions</th></tr></thead>
          <tbody>{visible.map((s) => { const index = ordered.indexOf(s); return <tr key={s.id}>
            <td><input type="checkbox" aria-label={`Select ${s.title}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
            <td><div className="adm-title-cell"><img src={imageOf(s.imageUrl)} alt="" className="adm-thumb-sm" /><div><strong>{s.title}</strong><span className="adm-muted">/{s.slug} · {s.category || 'No category'}{s.featured ? ' · Featured' : ''}{s.showOnHome ? ' · Home' : ''}</span></div></div></td>
            <td>{courseName(s.courseId)}</td><td><StatusBadge status={s.status} /></td>
            <td><div className="adm-controls"><button type="button" className="adm-icon" disabled={!canReorder || index === 0 || busy} onClick={() => reorder(index, -1)} aria-label={`Move ${s.title} up`}><ArrowUp size={15} aria-hidden="true" /></button>
              <button type="button" className="adm-icon" disabled={!canReorder || index === ordered.length - 1 || busy} onClick={() => reorder(index, 1)} aria-label={`Move ${s.title} down`}><ArrowDown size={15} aria-hidden="true" /></button></div></td>
            <td><div className="adm-controls"><button type="button" className="adm-icon" onClick={() => setPreview(s)} aria-label={`Preview ${s.title}`}><Eye size={15} aria-hidden="true" /></button>
              <button type="button" className="adm-icon" onClick={() => setEditing(s)} aria-label={`Edit ${s.title}`}><Pencil size={15} aria-hidden="true" /></button>
              <button type="button" className="adm-icon adm-danger" onClick={() => setToDelete(s)} aria-label={`Delete ${s.title}`}><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>; })}</tbody></table></div>}
    {preview && <Preview station={preview} onClose={() => setPreview(null)} />}
    {toDelete && <ConfirmDialog title="Delete this station?" message={`“${toDelete.title}” and any files attached to it will be permanently deleted. This cannot be undone. Consider moving it to draft instead.`} confirmLabel="Delete station" busy={busy}
      onCancel={() => setToDelete(null)} onConfirm={() => { void run(() => request(`/admin/stations/${toDelete.id}`, { method: 'DELETE' }), `“${toDelete.title}” deleted.`).then(() => setToDelete(null)); }} />}
  </section>;
}

/* ----------------------------------------------------------- courses tab */

type CourseDraft = Omit<Course, 'id'>;

function CourseForm({ course, onClose, notify }: { course: Course | null; onClose: () => void; notify: Notify }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<CourseDraft>(() => course ? { ...course } : { slug: '', title: '', tag: '', description: '', meta: '', icon: 'brain', imageUrl: null, status: 'draft', featured: false, showOnHome: false, sortOrder: 0 });
  const [slugTouched, setSlugTouched] = useState(Boolean(course));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof CourseDraft>(key: K, value: CourseDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const { slug, title, tag, description, meta, icon, imageUrl, status, featured, showOnHome, sortOrder } = draft;
    try {
      await request(course ? `/admin/courses/${course.id}` : '/admin/courses', { method: course ? 'PUT' : 'POST', body: { slug, title, tag, description, meta, icon, imageUrl: imageUrl || null, status, featured, showOnHome, sortOrder } });
      await qc.invalidateQueries(); notify({ type: 'ok', text: `“${title}” saved.` }); onClose();
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <form className="adm-form" onSubmit={save}>
    <div className="adm-form-head"><h2>{course ? 'Edit course' : 'New course'}</h2><button type="button" className="btn btn-light" onClick={onClose}>Back to list</button></div>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <div className="adm-grid">
      <Field label="Title"><input value={draft.title} required onChange={(event) => { set('title', event.target.value); if (!slugTouched) set('slug', slugify(event.target.value)); }} /></Field>
      <Field label="Slug" hint="Lowercase letters, numbers and dashes."><input value={draft.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={(event) => { setSlugTouched(true); set('slug', event.target.value); }} /></Field>
      <Field label="Tag" hint="Small label above the title, e.g. Featured pathway."><input value={draft.tag} onChange={(event) => set('tag', event.target.value)} /></Field>
      <Field label="Meta line"><input value={draft.meta} onChange={(event) => set('meta', event.target.value)} /></Field>
      <Field label="Icon"><select value={draft.icon} onChange={(event) => set('icon', event.target.value)}>{ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></Field>
      <Field label="Status"><select value={draft.status} onChange={(event) => set('status', event.target.value as PublishStatus)}><option value="draft">Draft (hidden)</option><option value="published">Published</option></select></Field>
      <Field label="Description" wide><textarea rows={3} value={draft.description} onChange={(event) => set('description', event.target.value)} /></Field>
      <div className="adm-wide"><span className="adm-label">Cover image</span><ImageField value={draft.imageUrl ?? ''} onChange={(url) => set('imageUrl', url || null)} /></div>
      <div className="adm-wide adm-checks"><Check label="Featured" checked={draft.featured} onChange={(v) => set('featured', v)} /><Check label="Show on the home page" checked={draft.showOnHome} onChange={(v) => set('showOnHome', v)} /></div>
    </div>
    <div className="adm-sticky-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save course'}</button></div>
  </form>;
}

function CoursesTab({ courses, stations, notify }: { courses: Course[]; stations: StationDetail[]; notify: Notify }) {
  const { run, busy } = useAdminAction(notify);
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<Course | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const ordered = useMemo(() => [...courses].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [courses]);
  if (editing) return <CourseForm course={editing === 'new' ? null : editing} notify={notify} onClose={() => setEditing(null)} />;
  const toggle = (id: number) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const setStatus = (status: PublishStatus) => { const ids = [...selected]; void run(() => request('/admin/status', { method: 'POST', body: { table: 'courses', ids, status } }), `${ids.length} course(s) updated.`).then((ok) => { if (ok) setSelected(new Set()); }); };
  return <section aria-label="Courses">
    <div className="adm-toolbar"><button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} aria-hidden="true" /> New course</button></div>
    {selected.size > 0 && <div className="adm-bulk" role="region" aria-label="Bulk actions"><strong>{selected.size} selected</strong>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('published')}>Publish</button>
      <button type="button" className="btn btn-light" disabled={busy} onClick={() => setStatus('draft')}>Hide (draft)</button></div>}
    {ordered.length === 0 ? <div className="state-box"><h3>No courses yet</h3><p>Create a course before adding stations.</p></div>
      : <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th scope="col"><span className="sr-only">Select</span></th><th scope="col">Course</th><th scope="col">Stations</th><th scope="col">Status</th><th scope="col">Order</th><th scope="col">Actions</th></tr></thead>
        <tbody>{ordered.map((c, index) => <tr key={c.id}>
          <td><input type="checkbox" aria-label={`Select ${c.title}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
          <td><strong>{c.title}</strong><span className="adm-muted"> /{c.slug}</span></td><td>{stations.filter((s) => s.courseId === c.id).length}</td><td><StatusBadge status={c.status} /></td>
          <td><div className="adm-controls"><button type="button" className="adm-icon" disabled={index === 0 || busy} aria-label={`Move ${c.title} up`} onClick={() => void run(() => request('/admin/reorder', { method: 'POST', body: { table: 'courses', ids: move(ordered, index, -1).map((x) => x.id) } }), 'Order saved.')}><ArrowUp size={15} aria-hidden="true" /></button>
            <button type="button" className="adm-icon" disabled={index === ordered.length - 1 || busy} aria-label={`Move ${c.title} down`} onClick={() => void run(() => request('/admin/reorder', { method: 'POST', body: { table: 'courses', ids: move(ordered, index, 1).map((x) => x.id) } }), 'Order saved.')}><ArrowDown size={15} aria-hidden="true" /></button></div></td>
          <td><div className="adm-controls"><button type="button" className="adm-icon" onClick={() => setEditing(c)} aria-label={`Edit ${c.title}`}><Pencil size={15} aria-hidden="true" /></button>
            <button type="button" className="adm-icon adm-danger" onClick={() => setToDelete(c)} aria-label={`Delete ${c.title}`}><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div>}
    {toDelete && <ConfirmDialog title="Delete this course?" message={`“${toDelete.title}”, its ${stations.filter((s) => s.courseId === toDelete.id).length} stations, topic groups, and uploaded course files will be permanently deleted. This cannot be undone.`} confirmLabel="Delete course" busy={busy}
      onCancel={() => setToDelete(null)} onConfirm={() => { void run(() => request(`/admin/courses/${toDelete.id}`, { method: 'DELETE' }), `“${toDelete.title}” deleted.`).then(() => setToDelete(null)); }} />}
  </section>;
}

/* ------------------------------------------------------------ topics tab */

function GroupForm({ group, courseId, stations, courses, onClose, notify }: { group: TopicGroup | null; courseId: number; stations: StationDetail[]; courses: Course[]; onClose: () => void; notify: Notify }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? '');
  const [course, setCourse] = useState(group?.courseId ?? courseId);
  const [topics, setTopics] = useState<TopicItem[]>(group?.topics ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const courseStations = stations.filter((s) => s.courseId === course);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const clean = topics.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), ...(t.stationSlug ? { stationSlug: t.stationSlug } : {}) }));
    try {
      await request(group ? `/admin/groups/${group.id}` : '/admin/groups', { method: group ? 'PUT' : 'POST', body: { courseId: course, name, topics: clean, sortOrder: group?.sortOrder ?? 0 } });
      await qc.invalidateQueries(); notify({ type: 'ok', text: `“${name}” saved.` }); onClose();
    } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <form className="adm-form" onSubmit={save}>
    <div className="adm-form-head"><h2>{group ? 'Edit topic group' : 'New topic group'}</h2><button type="button" className="btn btn-light" onClick={onClose}>Back to list</button></div>
    {error && <p className="adm-error" role="alert">{error}</p>}
    <div className="adm-grid">
      <Field label="Group name"><input value={name} required onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Course"><select value={course} onChange={(event) => setCourse(Number(event.target.value))}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
    </div>
    <h3>Topics</h3>
    <p className="adm-muted">Link a topic to a station to turn it into a clickable “ready” station on the course page. Only published stations are shown to students.</p>
    <div className="adm-list">
      {topics.length === 0 && <p className="adm-muted">No topics yet.</p>}
      {topics.map((topic, i) => <div className="adm-item" key={i}><div className="adm-grid">
        <Field label={`Topic ${i + 1}`}><input value={topic.title} onChange={(event) => setTopics(replaceAt(topics, i, { ...topic, title: event.target.value }))} /></Field>
        <Field label="Linked station"><select value={topic.stationSlug ?? ''} onChange={(event) => setTopics(replaceAt(topics, i, { title: topic.title, ...(event.target.value ? { stationSlug: event.target.value } : {}) }))}>
          <option value="">None</option>{courseStations.map((s) => <option key={s.id} value={s.slug}>{s.title}{s.status === 'draft' ? ' (draft)' : ''}</option>)}</select></Field></div>
        <ItemControls index={i} count={topics.length} label={`topic ${i + 1}`} onMove={(d) => setTopics(move(topics, i, d))} onRemove={() => setTopics(removeAt(topics, i))} /></div>)}
      <button type="button" className="btn btn-light adm-add" onClick={() => setTopics([...topics, { title: '' }])}><Plus size={15} aria-hidden="true" /> Add topic</button>
    </div>
    <div className="adm-sticky-actions"><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save group'}</button></div>
  </form>;
}

function TopicsTab({ courses, groups, stations, notify }: { courses: Course[]; groups: TopicGroup[]; stations: StationDetail[]; notify: Notify }) {
  const { run, busy } = useAdminAction(notify);
  const [courseId, setCourseId] = useState<number | null>(courses[0]?.id ?? null);
  const [editing, setEditing] = useState<TopicGroup | 'new' | null>(null);
  const [toDelete, setToDelete] = useState<TopicGroup | null>(null);
  const activeCourse = courseId ?? courses[0]?.id ?? null;
  const ordered = useMemo(() => groups.filter((g) => g.courseId === activeCourse).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id), [groups, activeCourse]);
  if (activeCourse === null) return <div className="state-box"><h3>Create a course first</h3><p>Topic groups belong to a course.</p></div>;
  if (editing) return <GroupForm group={editing === 'new' ? null : editing} courseId={activeCourse} stations={stations} courses={courses} notify={notify} onClose={() => setEditing(null)} />;
  return <section aria-label="Topic groups">
    <div className="adm-toolbar">
      <select aria-label="Course" value={activeCourse} onChange={(event) => setCourseId(Number(event.target.value))}>{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
      <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={15} aria-hidden="true" /> New topic group</button>
    </div>
    {ordered.length === 0 ? <div className="state-box"><h3>No topic groups yet</h3><p>Add a group such as “Seizures”, then list its topics.</p></div>
      : <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th scope="col">Group</th><th scope="col">Topics</th><th scope="col">Linked</th><th scope="col">Order</th><th scope="col">Actions</th></tr></thead>
        <tbody>{ordered.map((g, index) => <tr key={g.id}><td><strong>{g.name}</strong></td><td>{g.topics.length}</td><td>{g.topics.filter((t) => t.stationSlug).length}</td>
          <td><div className="adm-controls"><button type="button" className="adm-icon" disabled={index === 0 || busy} aria-label={`Move ${g.name} up`} onClick={() => void run(() => request('/admin/reorder', { method: 'POST', body: { table: 'groups', ids: move(ordered, index, -1).map((x) => x.id) } }), 'Order saved.')}><ArrowUp size={15} aria-hidden="true" /></button>
            <button type="button" className="adm-icon" disabled={index === ordered.length - 1 || busy} aria-label={`Move ${g.name} down`} onClick={() => void run(() => request('/admin/reorder', { method: 'POST', body: { table: 'groups', ids: move(ordered, index, 1).map((x) => x.id) } }), 'Order saved.')}><ArrowDown size={15} aria-hidden="true" /></button></div></td>
          <td><div className="adm-controls"><button type="button" className="adm-icon" onClick={() => setEditing(g)} aria-label={`Edit ${g.name}`}><Pencil size={15} aria-hidden="true" /></button>
            <button type="button" className="adm-icon adm-danger" onClick={() => setToDelete(g)} aria-label={`Delete ${g.name}`}><Trash2 size={15} aria-hidden="true" /></button></div></td></tr>)}</tbody></table></div>}
    {toDelete && <ConfirmDialog title="Delete this topic group?" message={`“${toDelete.name}” and its topic list will be deleted. Stations in this group are kept but become ungrouped.`} confirmLabel="Delete group" busy={busy}
      onCancel={() => setToDelete(null)} onConfirm={() => { void run(() => request(`/admin/groups/${toDelete.id}`, { method: 'DELETE' }), `“${toDelete.name}” deleted.`).then(() => setToDelete(null)); }} />}
  </section>;
}

/* ------------------------------------------------------------- dashboard */

type Tab = 'stations' | 'courses' | 'topics' | 'assets';

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('stations');
  const [notice, setNotice] = useState<Notice | null>(null);
  const courses = useQuery({ queryKey: ['admin', 'courses'], queryFn: () => request<Course[]>('/admin/courses') });
  const groups = useQuery({ queryKey: ['admin', 'groups'], queryFn: () => request<TopicGroup[]>('/admin/groups') });
  const stations = useQuery({ queryKey: ['admin', 'stations'], queryFn: () => request<StationDetail[]>('/admin/stations') });
  const failed = [courses, groups, stations].find((q) => q.isError);

  useEffect(() => {
    if (failed?.error instanceof ApiError && failed.error.status === 401) qc.setQueryData(['admin', 'me'], { authenticated: false });
  }, [failed?.error, qc]);

  async function logout() {
    try { await request('/admin/logout', { method: 'POST' }); } catch { /* the cookie may already be gone */ }
    qc.removeQueries({ queryKey: ['admin', 'courses'] }); qc.removeQueries({ queryKey: ['admin', 'groups'] }); qc.removeQueries({ queryKey: ['admin', 'stations'] });
    qc.setQueryData(['admin', 'me'], { authenticated: false });
    onLogout();
  }

  const tabs: { id: Tab; label: string }[] = [{ id: 'stations', label: 'Stations & exams' }, { id: 'courses', label: 'Courses' }, { id: 'topics', label: 'Topic groups' }, { id: 'assets', label: 'Videos & files' }];
  return <div className="adm-shell">
    <header className="adm-header"><div><span className="eyebrow">OSCEPASS admin</span><h1>Content manager</h1></div>
      <div className="adm-row-actions"><Link href="/" className="btn btn-light">View site</Link><button type="button" className="btn btn-light" onClick={() => void logout()}><LogOut size={15} aria-hidden="true" /> Sign out</button></div></header>
    <div className="adm-tabs" role="tablist" aria-label="Admin sections">{tabs.map((t) => <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className="adm-tab" onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    {notice && <div className={`adm-notice adm-notice-${notice.type}`} role={notice.type === 'err' ? 'alert' : 'status'}><span>{notice.text}</span><button type="button" className="adm-icon" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} aria-hidden="true" /></button></div>}
    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
      {(courses.isPending || groups.isPending || stations.isPending) && !failed && <LoadingBlock label="Loading content" />}
      {failed && <ErrorBlock error={failed.error} onRetry={() => { void courses.refetch(); void groups.refetch(); void stations.refetch(); }} />}
      {courses.data && groups.data && stations.data && <>
        {tab === 'stations' && <StationsTab stations={stations.data} courses={courses.data} groups={groups.data} notify={setNotice} />}
        {tab === 'courses' && <CoursesTab courses={courses.data} stations={stations.data} notify={setNotice} />}
        {tab === 'topics' && <TopicsTab courses={courses.data} groups={groups.data} stations={stations.data} notify={setNotice} />}
        {tab === 'assets' && <CourseAssetsTab courses={courses.data} notify={setNotice} />}
      </>}
    </div>
  </div>;
}

/* ------------------------------------------------------------------ page */

export default function AdminPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: () => request<{ authenticated: boolean }>('/admin/me'), staleTime: 0 });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Admin | OSCEPASS';
    const robots = document.querySelector('meta[name="robots"]');
    const previousRobots = robots?.getAttribute('content') ?? null;
    robots?.setAttribute('content', 'noindex, nofollow');
    return () => { document.title = previousTitle; if (robots && previousRobots) robots.setAttribute('content', previousRobots); };
  }, []);

  if (me.isPending) return <LoadingBlock label="Checking your session" />;
  if (me.isError) return <ErrorBlock error={me.error} onRetry={() => me.refetch()} />;
  if (!me.data.authenticated) return <LoginForm onDone={() => { void qc.invalidateQueries({ queryKey: ['admin', 'me'] }); }} />;
  return <Dashboard onLogout={() => { void qc.invalidateQueries({ queryKey: ['admin', 'me'] }); }} />;
}
