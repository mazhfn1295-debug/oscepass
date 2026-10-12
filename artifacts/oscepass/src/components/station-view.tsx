import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { Link } from 'wouter';
import { normaliseContent, type StationContent, type StationDetail } from '@/lib/api';
import { RichText, inline, safeUrl } from '@/components/rich-text';

type Mode = 'learn' | 'exam';
type ExamView = 'candidate' | 'examiner';
type Phase = 'ready' | 'history' | 'examiner' | 'done';

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (seconds: number) => `${pad(Math.floor(Math.max(0, seconds) / 60))}:${pad(Math.max(0, seconds) % 60)}`;

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return <details className="sv-section" open={open}><summary>{title}</summary><div className="sv-section-body">{children}</div></details>;
}

function BulletList({ items }: { items: string[] }) {
  return <ul className="sv-list">{items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>;
}

function PairTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return <div className="sv-table-wrap"><table className="sv-table"><thead><tr><th scope="col">{head[0]}</th><th scope="col">{head[1]}</th></tr></thead>
    <tbody>{rows.map(([a, b], i) => <tr key={i}><th scope="row">{inline(a)}</th><td>{inline(b)}</td></tr>)}</tbody></table></div>;
}

function ActorBriefs({ content }: { content: StationContent }) {
  if (!content.actorBriefs.length) return null;
  return <Section title="Actor briefs">{content.actorBriefs.map((brief, i) => <div className="sv-block" key={i}>
    <h3>{brief.role || 'Actor brief'}</h3>
    {brief.notes.length > 0 && <BulletList items={brief.notes} />}
    {brief.items.length > 0 && <BulletList items={brief.items} />}
    {brief.table.length > 0 && <PairTable head={['Topic', 'Response']} rows={brief.table.map((row) => [row.topic, row.response])} />}
  </div>)}</Section>;
}

function History({ content }: { content: StationContent }) {
  if (!content.history.length) return null;
  const label = (speaker: string, custom?: string) => custom || ({ doctor: 'Doctor', patient: 'Patient', witness: content.witnessLabel || 'Witness', note: 'Note' } as Record<string, string>)[speaker] || speaker;
  return <Section title="History script">{content.history.map((part, i) => <div className="sv-block" key={i}>
    <h3>{part.title}</h3>
    <div className="sv-dialogue">{part.lines.map((line, j) => line.speaker === 'note'
      ? <p className="sv-line sv-note" key={j}>{inline(line.text)}</p>
      : <p className={`sv-line sv-${line.speaker}`} key={j}><strong>{label(line.speaker, line.label)}:</strong> {inline(line.text)}</p>)}</div>
  </div>)}</Section>;
}

function MarkScheme({ content }: { content: StationContent }) {
  if (!content.markScheme.length && !content.globalRating.length && !content.commonErrors.length) return null;
  const total = content.markScheme.reduce((sum, row) => sum + row.max, 0);
  return <Section title="Mark scheme">
    {content.markScheme.length > 0 && <div className="sv-table-wrap"><table className="sv-table"><thead><tr><th scope="col">Domain</th><th scope="col">Expected</th><th scope="col">Marks</th></tr></thead>
      <tbody>{content.markScheme.map((row, i) => <tr key={i}><th scope="row">{inline(row.domain)}</th><td>{row.expected ? inline(row.expected) : null}</td><td>{row.max}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row" colSpan={2}>Total</th><td>{total}</td></tr></tfoot></table></div>}
    {content.globalRating.length > 0 && <><h3>Global rating</h3><PairTable head={['Grade', 'Description']} rows={content.globalRating.map((row) => [row.grade, row.description])} /></>}
    {content.commonErrors.length > 0 && <><h3>Common errors</h3><BulletList items={content.commonErrors} /></>}
  </Section>;
}

function Questions({ content }: { content: StationContent }) {
  if (!content.questions.length) return null;
  return <Section title="Examiner questions and answers">{content.questions.map((item, i) => <details className="sv-qa" key={i}>
    <summary>{i + 1}. {inline(item.question)}</summary><RichText text={item.answer} /></details>)}</Section>;
}

function Extras({ content }: { content: StationContent }) {
  return <>
    {content.examinerExpects.length > 0 && <Section title="What the examiner expects"><PairTable head={['Task', 'Expected']} rows={content.examinerExpects.map((row) => [row.task, row.expected])} /></Section>}
    {content.redFlags.length > 0 && <Section title="Red flags"><BulletList items={content.redFlags} /></Section>}
    {content.howToAnswer.length > 0 && <Section title="How to answer"><BulletList items={content.howToAnswer} /></Section>}
    {content.reactions.length > 0 && <Section title="Reactions and difficult moments"><PairTable head={['Situation', 'Response']} rows={content.reactions.map((row) => [row.situation, row.response])} /></Section>}
    {content.plainLanguage.length > 0 && <Section title="Plain-language phrases"><PairTable head={['Term', 'Say instead']} rows={content.plainLanguage.map((row) => [row.term, row.say])} /></Section>}
    {content.patientQuestions.length > 0 && <Section title="Questions the patient may ask"><PairTable head={['Question', 'Reply']} rows={content.patientQuestions.map((row) => [row.question, row.reply])} /></Section>}
  </>;
}

function Closing({ content }: { content: StationContent }) {
  return <>
    {content.teachingPoints.length > 0 && <Section title="Teaching points"><BulletList items={content.teachingPoints} /></Section>}
    {content.resources.length > 0 && <Section title="References and resources"><ul className="sv-list">{content.resources.map((item, i) => {
      const href = safeUrl(item.url);
      return <li key={i}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{item.label}</a> : item.label}</li>;
    })}</ul></Section>}
  </>;
}

function Learning({ content }: { content: StationContent }) {
  return <div className="sv-stack">
    {(content.aim || content.learningOutcomes.length > 0) && <Section title="Aim and learning outcomes">
      {content.aim && <RichText text={content.aim} />}
      {content.learningOutcomes.length > 0 && <BulletList items={content.learningOutcomes} />}</Section>}
    {content.instructions && <Section title="Candidate instructions"><RichText text={content.instructions} /></Section>}
    <ActorBriefs content={content} />
    <History content={content} />
    <MarkScheme content={content} />
    <Questions content={content} />
    <Extras content={content} />
    <Closing content={content} />
  </div>;
}

/** History minutes, then examiner minutes. Uses a wall-clock deadline so tab throttling cannot drift it. */
function useStationTimer(historySec: number, examinerSec: number) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [remaining, setRemaining] = useState(historySec);
  const [running, setRunning] = useState(false);
  const deadline = useRef(0);
  const config = useRef({ historySec, examinerSec });
  config.current = { historySec, examinerSec };

  useEffect(() => { if (phase === 'ready') setRemaining(historySec); }, [historySec, phase]);

  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => {
      const left = Math.ceil((deadline.current - Date.now()) / 1000);
      if (left > 0) { setRemaining(left); return; }
      if (phase === 'history' && config.current.examinerSec > 0) {
        setPhase('examiner');
        deadline.current = Date.now() + config.current.examinerSec * 1000;
        setRemaining(config.current.examinerSec);
      } else {
        setPhase('done'); setRunning(false); setRemaining(0);
      }
    }, 250);
    return () => window.clearInterval(tick);
  }, [running, phase]);

  return {
    phase, remaining, running,
    start() { deadline.current = Date.now() + config.current.historySec * 1000; setPhase('history'); setRemaining(config.current.historySec); setRunning(true); },
    pause() { setRemaining(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))); setRunning(false); },
    resume() { deadline.current = Date.now() + remaining * 1000; setRunning(true); },
    next() {
      if (phase === 'history' && config.current.examinerSec > 0) { setPhase('examiner'); deadline.current = Date.now() + config.current.examinerSec * 1000; setRemaining(config.current.examinerSec); setRunning(true); }
      else { setPhase('done'); setRunning(false); setRemaining(0); }
    },
    reset() { setRunning(false); setPhase('ready'); setRemaining(config.current.historySec); },
  };
}

const phaseLabel: Record<Phase, string> = { ready: 'Ready to start', history: 'History taking', examiner: 'Examiner questions', done: 'Station finished' };

function Timer({ content }: { content: StationContent }) {
  const timer = useStationTimer(content.timing.historyMin * 60, content.timing.examinerMin * 60);
  const [announce, setAnnounce] = useState('');
  useEffect(() => { setAnnounce(phaseLabel[timer.phase]); }, [timer.phase]);
  return <div className="sv-timer">
    <div className="sv-timer-face" role="timer" aria-label="Station time remaining">{clock(timer.remaining)}</div>
    <div className="sv-timer-info"><strong>{phaseLabel[timer.phase]}</strong>
      <span>{content.timing.historyMin} min history{content.timing.examinerMin > 0 ? `, then ${content.timing.examinerMin} min examiner questions` : ''}</span></div>
    <div className="sv-timer-actions">
      {timer.phase === 'ready' && <button type="button" className="btn btn-primary" onClick={timer.start}><Play size={15} aria-hidden="true" /> Start station</button>}
      {(timer.phase === 'history' || timer.phase === 'examiner') && <>
        {timer.running ? <button type="button" className="btn btn-light" onClick={timer.pause}><Pause size={15} aria-hidden="true" /> Pause</button>
          : <button type="button" className="btn btn-primary" onClick={timer.resume}><Play size={15} aria-hidden="true" /> Resume</button>}
        <button type="button" className="btn btn-light" onClick={timer.next}><SkipForward size={15} aria-hidden="true" /> {timer.phase === 'history' && content.timing.examinerMin > 0 ? 'Go to examiner questions' : 'Finish'}</button></>}
      {timer.phase !== 'ready' && <button type="button" className="btn btn-light" onClick={timer.reset}><RotateCcw size={15} aria-hidden="true" /> Reset</button>}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{announce}</p>
  </div>;
}

type SavedAttempt = {
  id: string;
  completedAt: string;
  total: number;
  maximum: number;
  rating: string;
};

function readAttempts(key: string): SavedAttempt[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is SavedAttempt =>
      item !== null &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.completedAt === "string" &&
      typeof item.total === "number" &&
      typeof item.maximum === "number" &&
      typeof item.rating === "string"
    ).slice(0, 10);
  } catch {
    return [];
  }
}

function ScoreSheet({ content, stationSlug }: { content: StationContent; stationSlug: string }) {
  const [scores, setScores] = useState<Record<number, number>>({});
  const [rating, setRating] = useState('');
  const storageKey = `oscepass:attempts:${stationSlug}`;
  const [attempts, setAttempts] = useState<SavedAttempt[]>(() => readAttempts(storageKey));
  const [saveMessage, setSaveMessage] = useState("");
  const max = content.markScheme.reduce((sum, row) => sum + row.max, 0);
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (!content.markScheme.length) return null;
  function saveAttempt() {
    if (Object.keys(scores).length < content.markScheme.length) {
      setSaveMessage("Enter a score for every domain, including zero marks, before saving.");
      return;
    }
    const next = [{
      id: `${Date.now()}`,
      completedAt: new Date().toISOString(),
      total,
      maximum: max,
      rating,
    }, ...attempts].slice(0, 10);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setAttempts(next);
      setSaveMessage("Attempt saved on this device.");
    } catch {
      setSaveMessage("This browser could not save the attempt. Check its local storage settings.");
    }
  }
  return <section className="sv-score" aria-label="Score sheet">
    <div className="sv-score-head"><h2>Score sheet</h2><div className="sv-score-total" aria-live="polite">{total} / {max}</div></div>
    <p className="sv-muted">Save up to 10 recent attempts on this device. Results are not linked to an account or synced between devices.</p>
    <div className="sv-table-wrap"><table className="sv-table"><thead><tr><th scope="col">Domain</th><th scope="col">Expected</th><th scope="col">Score</th></tr></thead><tbody>
      {content.markScheme.map((row, i) => <tr key={i}><th scope="row">{inline(row.domain)}</th><td>{row.expected ? inline(row.expected) : null}</td>
        <td><label className="sr-only" htmlFor={`score-${i}`}>Score for {row.domain}, maximum {row.max}</label>
          <input id={`score-${i}`} className="sv-score-input" type="number" inputMode="numeric" min={0} max={row.max} value={scores[i] ?? ''} placeholder="0"
            onChange={(event) => { const n = Math.min(row.max, Math.max(0, Math.floor(Number(event.target.value) || 0))); setScores((current) => ({ ...current, [i]: n })); }} /> <span className="sv-muted">/ {row.max}</span></td></tr>)}
    </tbody></table></div>
    {content.globalRating.length > 0 && <fieldset className="sv-rating"><legend>Global rating</legend>
      {content.globalRating.map((item, i) => <label key={i}><input type="radio" name="global-rating" checked={rating === item.grade} onChange={() => setRating(item.grade)} /> <span><strong>{item.grade}</strong> {item.description}</span></label>)}</fieldset>}
    <div className="sv-score-actions">
      <button type="button" className="btn btn-primary" onClick={saveAttempt}>Save this attempt</button>
      <button type="button" className="btn btn-light" onClick={() => { setScores({}); setRating(''); setSaveMessage(""); }}><RotateCcw size={15} aria-hidden="true" /> Clear scores</button>
    </div>
    <p className="sv-muted" role="status" aria-live="polite">{saveMessage}</p>
    {attempts.length > 0 && <section className="sv-attempt-history" aria-label="Recent saved attempts"><h3>Recent attempts</h3><ol>{attempts.map((attempt) => <li key={attempt.id}><time dateTime={attempt.completedAt}>{new Date(attempt.completedAt).toLocaleString()}</time><strong>{attempt.total} / {attempt.maximum}</strong>{attempt.rating && <span>{attempt.rating}</span>}</li>)}</ol></section>}
  </section>;
}

function Exam({ content, stationSlug }: { content: StationContent; stationSlug: string }) {
  const [view, setView] = useState<ExamView>('candidate');
  return <div className="sv-stack">
    <Timer content={content} />
    <div className="sv-toggle sv-toggle-small" role="group" aria-label="Exam view">
      <button type="button" aria-pressed={view === 'candidate'} onClick={() => setView('candidate')}>Candidate view</button>
      <button type="button" aria-pressed={view === 'examiner'} onClick={() => setView('examiner')}>Examiner view</button>
    </div>
    {view === 'candidate'
      ? <section className="sv-candidate"><h2>Candidate instructions</h2>{content.instructions ? <RichText text={content.instructions} /> : <p className="sv-muted">No candidate instructions have been added to this station yet.</p>}</section>
      : <>
        <ScoreSheet content={content} stationSlug={stationSlug} />
        <ActorBriefs content={content} />
        <History content={content} />
        <Questions content={content} />
        <Extras content={content} />
      </>}
  </div>;
}

export function StationView({ station, preview = false }: { station: StationDetail; preview?: boolean }) {
  const [mode, setMode] = useState<Mode>('learn');
  const content = useMemo(() => normaliseContent(station.content), [station.content]);
  return <article className={`sv-shell${preview ? ' sv-preview' : ''}`}>
    {!preview && <div className="sv-nav"><Link href="/neurology"><ArrowLeft size={16} aria-hidden="true" /> MRCEM Neurology topics</Link><Link href="/practice">All practice cases <ArrowRight size={15} aria-hidden="true" /></Link></div>}
    <header className="sv-head">
      <span className="eyebrow">{station.category || 'OSCE station'}</span>
      <h1>{station.title}</h1>
      {station.summary && <p>{station.summary}</p>}
      <p className="sv-meta">{content.timing.historyMin + content.timing.examinerMin} min station · {content.totalMarks} marks</p>
    </header>
    <p className="edu-notice" role="note">For education and exam practice only. Not clinical guidance; it does not replace local protocols, current guidelines or clinical judgement.</p>
    <div className="sv-toggle" role="group" aria-label="Station mode">
      <button type="button" aria-pressed={mode === 'learn'} onClick={() => setMode('learn')}>Learning mode</button>
      <button type="button" aria-pressed={mode === 'exam'} onClick={() => setMode('exam')}>Exam mode</button>
    </div>
    {mode === 'learn' ? <Learning content={content} /> : <Exam content={content} stationSlug={station.slug} />}
  </article>;
}
