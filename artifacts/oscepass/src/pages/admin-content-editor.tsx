import { useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { normaliseContent, type Speaker, type StationContent } from '@/lib/api';
import { Field, ItemControls, move, removeAt, replaceAt } from '@/pages/admin-ui';

const FORMAT_HINT = 'Use **bold** for emphasis. Start a line with "- " for a bullet list.';

function Panel({ title, count, children, open = false }: { title: string; count?: number; children: ReactNode; open?: boolean }) {
  return <details className="adm-panel" open={open}><summary>{title}{count !== undefined && <span className="adm-count">{count}</span>}</summary><div className="adm-panel-body">{children}</div></details>;
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="btn btn-light adm-add" onClick={onClick}><Plus size={15} aria-hidden="true" /> {label}</button>;
}

function StringListEditor({ label, items, onChange, multiline = true }: { label: string; items: string[]; onChange: (items: string[]) => void; multiline?: boolean }) {
  return <div className="adm-list">
    {items.length === 0 && <p className="adm-muted">Nothing added yet.</p>}
    {items.map((item, i) => <div className="adm-item" key={i}>
      <Field label={`${label} ${i + 1}`}>{multiline
        ? <textarea rows={2} value={item} onChange={(event) => onChange(replaceAt(items, i, event.target.value))} />
        : <input value={item} onChange={(event) => onChange(replaceAt(items, i, event.target.value))} />}</Field>
      <ItemControls index={i} count={items.length} label={`${label} ${i + 1}`} onMove={(d) => onChange(move(items, i, d))} onRemove={() => onChange(removeAt(items, i))} />
    </div>)}
    <AddButton label={`Add ${label.toLowerCase()}`} onClick={() => onChange([...items, ''])} />
  </div>;
}

type Row = Record<string, string | number | undefined>;
interface RowField { key: string; label: string; type?: 'text' | 'textarea' | 'number' }

function RowListEditor({ label, rows, fields, blank, onChange }: { label: string; rows: Row[]; fields: RowField[]; blank: Row; onChange: (rows: Row[]) => void }) {
  return <div className="adm-list">
    {rows.length === 0 && <p className="adm-muted">Nothing added yet.</p>}
    {rows.map((row, i) => <div className="adm-item" key={i}>
      <div className="adm-grid">{fields.map((field) => <Field key={field.key} label={field.label} wide={field.type === 'textarea'}>
        {field.type === 'textarea'
          ? <textarea rows={3} value={String(row[field.key] ?? '')} onChange={(event) => onChange(replaceAt(rows, i, { ...row, [field.key]: event.target.value }))} />
          : field.type === 'number'
            ? <input type="number" min={0} value={Number(row[field.key] ?? 0)} onChange={(event) => onChange(replaceAt(rows, i, { ...row, [field.key]: Math.max(0, Math.floor(Number(event.target.value) || 0)) }))} />
            : <input value={String(row[field.key] ?? '')} onChange={(event) => onChange(replaceAt(rows, i, { ...row, [field.key]: event.target.value }))} />}
      </Field>)}</div>
      <ItemControls index={i} count={rows.length} label={`${label} ${i + 1}`} onMove={(d) => onChange(move(rows, i, d))} onRemove={() => onChange(removeAt(rows, i))} />
    </div>)}
    <AddButton label={`Add ${label.toLowerCase()}`} onClick={() => onChange([...rows, { ...blank }])} />
  </div>;
}

function ActorBriefsEditor({ value, onChange }: { value: StationContent['actorBriefs']; onChange: (value: StationContent['actorBriefs']) => void }) {
  return <div className="adm-list">
    {value.length === 0 && <p className="adm-muted">No actor briefs yet.</p>}
    {value.map((brief, i) => <div className="adm-card" key={i}>
      <div className="adm-card-head"><Field label="Role"><input value={brief.role} onChange={(event) => onChange(replaceAt(value, i, { ...brief, role: event.target.value }))} /></Field>
        <ItemControls index={i} count={value.length} label={`brief ${i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} /></div>
      <h4>Notes</h4><StringListEditor label="Note" items={brief.notes} onChange={(notes) => onChange(replaceAt(value, i, { ...brief, notes }))} />
      <h4>Brief points</h4><StringListEditor label="Point" items={brief.items} onChange={(items) => onChange(replaceAt(value, i, { ...brief, items }))} />
      <h4>Topic and response table</h4>
      <RowListEditor label="Table row" rows={brief.table} blank={{ topic: '', response: '' }} fields={[{ key: 'topic', label: 'Topic' }, { key: 'response', label: 'Response', type: 'textarea' }]}
        onChange={(table) => onChange(replaceAt(value, i, { ...brief, table: table as typeof brief.table }))} />
    </div>)}
    <AddButton label="Add actor brief" onClick={() => onChange([...value, { role: 'Actor brief', notes: [], items: [], table: [] }])} />
  </div>;
}

const speakers: Speaker[] = ['doctor', 'patient', 'witness', 'note'];

function HistoryEditor({ value, onChange }: { value: StationContent['history']; onChange: (value: StationContent['history']) => void }) {
  return <div className="adm-list">
    {value.length === 0 && <p className="adm-muted">No history sections yet.</p>}
    {value.map((part, i) => <div className="adm-card" key={i}>
      <div className="adm-card-head"><Field label="Section title"><input value={part.title} onChange={(event) => onChange(replaceAt(value, i, { ...part, title: event.target.value }))} /></Field>
        <ItemControls index={i} count={value.length} label={`section ${i + 1}`} onMove={(d) => onChange(move(value, i, d))} onRemove={() => onChange(removeAt(value, i))} /></div>
      {part.lines.map((line, j) => <div className="adm-item" key={j}>
        <div className="adm-grid">
          <Field label="Speaker"><select value={line.speaker} onChange={(event) => onChange(replaceAt(value, i, { ...part, lines: replaceAt(part.lines, j, { ...line, speaker: event.target.value as Speaker }) }))}>{speakers.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Field label="Label (optional)"><input value={line.label ?? ''} onChange={(event) => onChange(replaceAt(value, i, { ...part, lines: replaceAt(part.lines, j, { ...line, label: event.target.value || undefined }) }))} /></Field>
          <Field label="Text" wide><textarea rows={2} value={line.text} onChange={(event) => onChange(replaceAt(value, i, { ...part, lines: replaceAt(part.lines, j, { ...line, text: event.target.value }) }))} /></Field>
        </div>
        <ItemControls index={j} count={part.lines.length} label={`line ${j + 1}`} onMove={(d) => onChange(replaceAt(value, i, { ...part, lines: move(part.lines, j, d) }))} onRemove={() => onChange(replaceAt(value, i, { ...part, lines: removeAt(part.lines, j) }))} />
      </div>)}
      <AddButton label="Add line" onClick={() => onChange(replaceAt(value, i, { ...part, lines: [...part.lines, { speaker: 'doctor', text: '' }] }))} />
    </div>)}
    <AddButton label="Add history section" onClick={() => onChange([...value, { title: 'New section', lines: [] }])} />
  </div>;
}

export function ContentEditor({ value, onChange }: { value: StationContent; onChange: (value: StationContent) => void }) {
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState('');
  const set = <K extends keyof StationContent>(key: K, next: StationContent[K]) => onChange({ ...value, [key]: next });
  const rows = (list: unknown) => list as Row[];

  if (json !== null) {
    return <div className="adm-json">
      <p className="adm-muted">Advanced: edit the whole content as JSON. Press “Apply JSON” to load it into the form.</p>
      <textarea className="adm-code" rows={22} value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} aria-label="Station content JSON" />
      {jsonError && <p className="adm-error" role="alert">{jsonError}</p>}
      <div className="adm-row-actions">
        <button type="button" className="btn btn-primary" onClick={() => { try { onChange(normaliseContent(JSON.parse(json))); setJson(null); setJsonError(''); } catch { setJsonError('That is not valid JSON. Check commas and quotation marks.'); } }}>Apply JSON</button>
        <button type="button" className="btn btn-light" onClick={() => { setJson(null); setJsonError(''); }}>Discard changes</button>
      </div>
    </div>;
  }

  return <div className="adm-content">
    <div className="adm-row-actions"><button type="button" className="btn btn-light" onClick={() => setJson(JSON.stringify(value, null, 2))}>Edit as JSON</button></div>
    <Panel title="Basics and timing" open>
      <div className="adm-grid">
        <Field label="Aim" wide hint={FORMAT_HINT}><textarea rows={3} value={value.aim} onChange={(event) => set('aim', event.target.value)} /></Field>
        <Field label="Candidate instructions" wide hint={FORMAT_HINT}><textarea rows={4} value={value.instructions} onChange={(event) => set('instructions', event.target.value)} /></Field>
        <Field label="Witness label" hint="For example Witness, Friend or Relative."><input value={value.witnessLabel} onChange={(event) => set('witnessLabel', event.target.value)} /></Field>
        <Field label="History minutes"><input type="number" min={1} value={value.timing.historyMin} onChange={(event) => set('timing', { ...value.timing, historyMin: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} /></Field>
        <Field label="Examiner minutes"><input type="number" min={0} value={value.timing.examinerMin} onChange={(event) => set('timing', { ...value.timing, examinerMin: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} /></Field>
        <Field label="Total marks"><input type="number" min={1} value={value.totalMarks} onChange={(event) => set('totalMarks', Math.max(1, Math.floor(Number(event.target.value) || 1)))} /></Field>
      </div>
    </Panel>
    <Panel title="Learning outcomes" count={value.learningOutcomes.length}><StringListEditor label="Outcome" items={value.learningOutcomes} onChange={(v) => set('learningOutcomes', v)} /></Panel>
    <Panel title="Actor briefs" count={value.actorBriefs.length}><ActorBriefsEditor value={value.actorBriefs} onChange={(v) => set('actorBriefs', v)} /></Panel>
    <Panel title="History script" count={value.history.length}><HistoryEditor value={value.history} onChange={(v) => set('history', v)} /></Panel>
    <Panel title="Mark scheme" count={value.markScheme.length}>
      <RowListEditor label="Domain" rows={rows(value.markScheme)} blank={{ domain: '', expected: '', max: 1 }} fields={[{ key: 'domain', label: 'Domain' }, { key: 'max', label: 'Marks', type: 'number' }, { key: 'expected', label: 'Expected', type: 'textarea' }]} onChange={(v) => set('markScheme', v as StationContent['markScheme'])} />
      <p className="adm-muted">Marks in the scheme add up to {value.markScheme.reduce((sum, row) => sum + row.max, 0)} (total marks field: {value.totalMarks}).</p>
    </Panel>
    <Panel title="Global rating" count={value.globalRating.length}><RowListEditor label="Grade" rows={rows(value.globalRating)} blank={{ grade: '', description: '' }} fields={[{ key: 'grade', label: 'Grade' }, { key: 'description', label: 'Description', type: 'textarea' }]} onChange={(v) => set('globalRating', v as StationContent['globalRating'])} /></Panel>
    <Panel title="Common errors" count={value.commonErrors.length}><StringListEditor label="Error" items={value.commonErrors} onChange={(v) => set('commonErrors', v)} /></Panel>
    <Panel title="Examiner questions and answers" count={value.questions.length}><RowListEditor label="Question" rows={rows(value.questions)} blank={{ question: '', answer: '' }} fields={[{ key: 'question', label: 'Question' }, { key: 'answer', label: 'Answer', type: 'textarea' }]} onChange={(v) => set('questions', v as StationContent['questions'])} />
      <p className="adm-muted">{FORMAT_HINT}</p></Panel>
    <Panel title="What the examiner expects" count={value.examinerExpects.length}><RowListEditor label="Task" rows={rows(value.examinerExpects)} blank={{ task: '', expected: '' }} fields={[{ key: 'task', label: 'Task' }, { key: 'expected', label: 'Expected', type: 'textarea' }]} onChange={(v) => set('examinerExpects', v as StationContent['examinerExpects'])} /></Panel>
    <Panel title="Red flags" count={value.redFlags.length}><StringListEditor label="Red flag" items={value.redFlags} onChange={(v) => set('redFlags', v)} /></Panel>
    <Panel title="How to answer" count={value.howToAnswer.length}><StringListEditor label="Tip" items={value.howToAnswer} onChange={(v) => set('howToAnswer', v)} /></Panel>
    <Panel title="Reactions and difficult moments" count={value.reactions.length}><RowListEditor label="Situation" rows={rows(value.reactions)} blank={{ situation: '', response: '' }} fields={[{ key: 'situation', label: 'Situation' }, { key: 'response', label: 'Response', type: 'textarea' }]} onChange={(v) => set('reactions', v as StationContent['reactions'])} /></Panel>
    <Panel title="Plain-language phrases" count={value.plainLanguage.length}><RowListEditor label="Phrase" rows={rows(value.plainLanguage)} blank={{ term: '', say: '' }} fields={[{ key: 'term', label: 'Term' }, { key: 'say', label: 'Say instead' }]} onChange={(v) => set('plainLanguage', v as StationContent['plainLanguage'])} /></Panel>
    <Panel title="Questions the patient may ask" count={value.patientQuestions.length}><RowListEditor label="Question" rows={rows(value.patientQuestions)} blank={{ question: '', reply: '' }} fields={[{ key: 'question', label: 'Question' }, { key: 'reply', label: 'Reply', type: 'textarea' }]} onChange={(v) => set('patientQuestions', v as StationContent['patientQuestions'])} /></Panel>
    <Panel title="Teaching points" count={value.teachingPoints.length}><StringListEditor label="Point" items={value.teachingPoints} onChange={(v) => set('teachingPoints', v)} /></Panel>
    <Panel title="References and resources" count={value.resources.length}><RowListEditor label="Reference" rows={rows(value.resources)} blank={{ label: '', url: '' }} fields={[{ key: 'label', label: 'Label' }, { key: 'url', label: 'Link (https://…)' }]} onChange={(v) => set('resources', v.map((r) => ({ label: String(r.label ?? ''), url: r.url ? String(r.url) : undefined })))} /></Panel>
  </div>;
}
