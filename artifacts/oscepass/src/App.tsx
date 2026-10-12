import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Brain, Check, CheckCircle2,
  ChevronRight, ClipboardCheck, Clock3, FileText, GraduationCap, Headphones,
  HeartPulse, Menu, Play, Search, ShieldCheck, Stethoscope, Target, UserRound,
  Star, Video, X, type LucideIcon,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { StationView } from '@/components/station-view';
import { CourseMediaSection } from '@/components/course-media';
import { EmptyBlock, ErrorBlock, LoadingBlock, LoadingGrid } from '@/components/data-state';
import {
  ALL_TOPICS, ApiError, courseHref, filterStations, imageOf, uniqueCategories, useCourse, useCourses, useStation, useStations,
  type StationSummary,
} from '@/lib/api';
import { Link, Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';

const AdminPage = lazy(() => import('@/pages/admin'));
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } } });

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/courses', label: 'Courses' },
  { href: '/practice', label: 'Practice' },
  { href: '/resources', label: 'Resources' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

const modules = [
  { icon: Play, title: 'Common Presentations in A&E', description: 'Planned: history, examination and management of common A&E presentations.', color: '#0A84FF', image: '/brand/t1.jpg', href: '/courses', soon: true },
  { icon: FileText, title: 'OSCE Practice Cases', description: 'Timed neurology stations with examiner questions and marking points.', color: '#7C3AED', image: '/brand/t2.jpg', href: '/practice' },
  { icon: BookOpen, title: 'Clinical Guidelines', description: 'Planned: guideline references added to each station as it is clinically reviewed.', color: '#16A34A', image: '/brand/t3.jpg', href: '/resources', soon: true },
  { icon: Video, title: 'Live Teaching Sessions', description: 'Planned: live case discussion with examiners. Contact us to register interest.', color: '#0D9488', image: '/brand/t4.jpg', href: '/contact', soon: true },
  { icon: HeartPulse, title: 'Progress & Feedback', description: 'Planned: saved attempts, marks and improvement points.', color: '#DB2777', image: '/brand/t5.jpg', href: '/practice', soon: true },
  { icon: ShieldCheck, title: 'Student Resources', description: 'The MRCEM neurology curriculum outline and topic list.', color: '#4F46E5', image: '/brand/t6.jpg', href: '/resources' },
];

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} | OSCEPASS`;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', description);
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', `${title} | OSCEPASS`);
    let ogDescription = document.querySelector('meta[property="og:description"]');
    if (!ogDescription) {
      ogDescription = document.createElement('meta');
      ogDescription.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescription);
    }
    ogDescription.setAttribute('content', description);
  }, [title, description]);
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) {
      node.classList.add('is-visible');
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        node.classList.add('is-visible');
        observer.disconnect();
      }
    }, { threshold: .08 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <div className={`reveal ${className}`} ref={ref}>{children}</div>;
}

function Brand({ light = false }: { light?: boolean }) {
  return <Link href="/" className="brand" aria-label="OSCEPASS home" style={light ? { color: 'white' } : undefined}>
    <span className="brand-mark"><Stethoscope size={24} aria-hidden="true" /></span>
    <span className="brand-lockup"><span className="brand-word"><span>OSCE</span><i>PASS✓</i></span><small>Learn • Practice • Pass</small></span>
  </Link>;
}

function Header() {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  useEffect(() => setOpen(false), [location]);
  return <header className="site-header">
    <div className="container header-inner">
      <Brand />
      <nav className="nav-links" aria-label="Main navigation">
        {navItems.map((item) => <Link key={item.href} href={item.href} aria-current={location === item.href ? 'page' : undefined}>{item.label}</Link>)}
      </nav>
      <div className="nav-actions">
        <Link href="/login" className="btn btn-ghost">Login</Link>
        <Link href="/signup" className="btn btn-primary">Sign Up</Link>
      </div>
      <button className="menu-toggle" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="button-mobile-menu">
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>
    </div>
    {open && <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      <Link href="/login">Login</Link>
      <Link href="/signup" className="btn btn-primary">Sign Up</Link>
    </nav>}
  </header>;
}

function Footer() {
  return <footer className="site-footer">
    <div className="container">
      <div className="trust-row" aria-label="Why learners choose OSCEPASS">
        <div className="trust-items">
          <span><Target aria-hidden="true" />Designed for A&amp;E and OSCE success</span>
          <span><UserRound aria-hidden="true" />Flexible learning at your pace</span>
          <span><Star aria-hidden="true" />Built around MRCEM and A&amp;E topics</span>
          <span><Brain aria-hidden="true" />Timed, case-based practice</span>
        </div>
        <p className="trust-slogan">Better preparation.<br />Greater confidence.<br /><strong>Pass your OSCE.</strong></p>
      </div>
      <div className="footer-grid">
        <div className="footer-about">
          <Brand light />
          <p>Case-based stations, examiner-style questions and a clear structure to build your OSCE confidence.</p>
        </div>
        <div className="footer-column"><h3>Learn</h3><Link href="/courses">Explore courses</Link><Link href="/practice">OSCE practice cases</Link><Link href="/neurology">MRCEM Neurology</Link><Link href="/resources">Student resources</Link></div>
        <div className="footer-column"><h3>OSCEPASS</h3><Link href="/about">About us</Link><Link href="/contact">Contact</Link><Link href="/signup">Create an account</Link></div>
        <div className="footer-column"><h3>Get started</h3><Link href="/login">Student login</Link><Link href="/signup">Join OSCEPASS</Link><a href="mailto:hello@oscepass.com">hello@oscepass.com</a></div>
      </div>
      <p className="footer-disclaimer">OSCEPASS is for education and exam practice only. It is not clinical guidance and does not replace local protocols, current guidelines or your own clinical judgement.</p>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} OSCEPASS. All rights reserved.</span><span>Designed for the next generation of emergency clinicians.</span></div>
    </div>
  </footer>;
}

function SiteLayout({ children }: { children: ReactNode }) {
  return <><Header />{children}<Footer /></>;
}

function VideoModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [frame, setFrame] = useState(0);
  const previewFrames = [
    ['Start with the case', 'Read the candidate instructions and identify the task.'],
    ['Practise with structure', 'Work through a realistic emergency medicine scenario.'],
    ['Review examiner guidance', 'Use the marking domains and model answers to reflect.'],
  ];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(document.querySelectorAll<HTMLElement>('.video-modal button:not([disabled]), .video-modal a[href], .video-modal [tabindex]:not([tabindex="-1"])'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % previewFrames.length), 2600);
    return () => window.clearInterval(timer);
  }, [playing, previewFrames.length]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="video-modal" role="dialog" aria-modal="true" aria-labelledby="demo-title">
      <button className="modal-close" ref={closeRef} onClick={onClose} aria-label="Close video demo"><X size={21} /></button>
      <div className="modal-video" aria-live="polite">
        <div className="demo-window">
          <div className="demo-window-top"><span className="demo-dots"><i /><i /><i /></span><span>OSCEPASS · PRACTICE PREVIEW</span><span>DEMO</span></div>
          <div className="demo-window-body"><div className="demo-window-sidebar"><span className="demo-side-active">Station brief</span><span>Candidate view</span><span>Examiner feedback</span></div><div className="demo-window-content"><span className="demo-label">MRCEM OSCE · NEUROLOGY</span><h3>{previewFrames[frame][0]}</h3><p>{previewFrames[frame][1]}</p><div className="demo-placeholder-lines"><i /><i /><i /></div><div className="demo-window-footer"><span><span className="demo-dot" /> Case-based learning</span><span>08:00</span></div></div></div>
        </div>
        <div className="demo-caption"><div><h2 id="demo-title">A closer look at OSCEPASS</h2><p>{previewFrames[frame][1]}</p></div><button className="btn btn-primary" onClick={() => { if (!playing) setFrame((current) => (current + 1) % previewFrames.length); setPlaying((current) => !current); }} aria-label={playing ? 'Pause platform preview' : 'Play platform preview'}>{playing ? 'Pause preview' : <><Play size={15} fill="white" /> Play preview</>}</button></div>
      </div>
    </div>
  </div>;
}

const features = [
  { icon: Video, title: 'Teaching Videos', text: 'Planned: short teaching videos for common A&E presentations.', soon: true },
  { icon: BookOpen, title: 'Reading & Literature', text: 'The neurology curriculum outline and topic list to read before you practise.', soon: false },
  { icon: ClipboardCheck, title: 'AI Examiner Practice', text: 'Planned: AI-assisted station practice, released only after clinical review.', soon: true },
  { icon: Headphones, title: '1-to-1 Examiner Sessions', text: 'Planned: live case discussions with an examiner via video.', soon: true },
  { icon: HeartPulse, title: 'Progress Tracking', text: 'Planned: saved attempts, marks and improvement points.', soon: true },
  { icon: ShieldCheck, title: 'Student Accounts', text: 'Planned: sign in to keep your attempts and progress.', soon: true },
];

function FeaturedStations() {
  const stations = useStations();
  if (stations.isPending) return <LoadingGrid label="Loading stations" />;
  if (stations.isError) return <ErrorBlock error={stations.error} onRetry={() => stations.refetch()} />;
  const featured = stations.data.filter((station) => station.showOnHome);
  if (!featured.length) return <EmptyBlock title="No featured stations yet">Browse the full list on the practice page.</EmptyBlock>;
  return <div className="case-grid">{featured.map((station) => <Reveal key={station.slug}><Link className="case-card" href={`/neurology/${station.slug}`}><div className="case-thumb"><img src={imageOf(station.imageUrl)} alt="" loading="lazy" /><span className="case-type">{station.category || 'OSCE station'}</span></div><div className="case-content"><h3>{station.title}</h3><p>{station.summary}</p><span className="case-link">Open station <ArrowRight size={14} /></span></div></Link></Reveal>)}</div>;
}

function Home() {
  usePageMeta('A&E / OSCE Training Platform', 'Timed MRCEM neurology OSCE stations with examiner questions for emergency medicine learners.');
  const [videoOpen, setVideoOpen] = useState(false);
  return <SiteLayout>
    <main>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">A&amp;E OSCE preparation, made practical</span>
            <h1>Your A&amp;E / OSCE Training <span>Platform</span></h1>
            <p>Case-based stations. Examiner-style questions. Build your confidence and achieve your goals.</p>
            <div className="hero-actions"><Link className="btn btn-primary" href="/signup">Get Started <ArrowRight size={17} /></Link><button className="btn btn-light" onClick={() => setVideoOpen(true)} aria-haspopup="dialog"><Play size={16} /> Watch Demo</button></div>
            <div className="hero-proof"><span>Practical learning for emergency medicine trainees</span></div>
          </div>
          <div className="hero-art" aria-label="Emergency medicine team discussing a patient case">
            <div className="hero-photo-frame" />
            <img className="hero-photo" src="/brand/hero.jpg" alt="Emergency medicine team in a clinical teaching discussion" />
            <div className="floating-note"><span className="float-check"><Check size={19} /></span><span><strong>Practice with purpose</strong><small>Cases and examiner questions</small></span></div>
          </div>
        </div>
      </section>

      <section className="social-proof" aria-label="OSCEPASS at a glance">
        <div className="container proof-row"><div className="proof-label">A focused platform for emergency medicine learners</div><div className="proof-stat"><strong>Case-based</strong><small>OSCE stations</small></div><div className="proof-divider" /><div className="proof-stat"><strong>Examiner</strong><small>style questions</small></div><div className="proof-divider" /><div className="proof-stat"><strong>Flexible</strong><small>practice, your pace</small></div></div>
      </section>

      <section className="section feature-strip">
        <div className="container">
          <Reveal><div className="section-heading"><span className="eyebrow">Everything in one place</span><h2>Prepare for the station. Not just the syllabus.</h2><p>Build clinical structure and exam confidence with the resources, teaching and practice you need in one place.</p></div></Reveal>
          <div className="feature-grid">{features.map(({ icon: Icon, title, text, soon }, index) => <Reveal key={title} className={`delay-${index}`}><article className="feature-card"><span className="icon-tile"><Icon size={21} /></span><h3>{title}</h3><p>{text}</p>{soon && <span className="soon-badge">Coming soon</span>}</article></Reveal>)}</div>
        </div>
      </section>

      <section className="section modules-section">
        <div className="container">
          <Reveal><div className="section-heading modules-heading"><div><span className="eyebrow">Your learning pathway</span><h2>Explore Our Modules</h2></div><Link className="link-all-courses" href="/courses">View All Courses <ArrowRight size={15} /></Link></div></Reveal>
          <div className="module-grid">{modules.map(({ icon: Icon, title, description, color, image, href, soon }) => <Reveal key={title}><article className="module-card">
            <Link href={href} className="module-image-link" aria-label={`Explore ${title}`}><img src={image} alt={`${title} learning module`} loading="lazy" /><span className="module-icon" style={{ backgroundColor: color }}><Icon size={19} aria-hidden="true" /></span></Link>
            <div className="module-content"><h3>{title}</h3><p>{description}</p>{soon ? <span className="soon-badge">Coming soon</span> : <Link className="module-more" href={href}>Learn More <ArrowRight size={14} /></Link>}</div>
          </article></Reveal>)}</div>
        </div>
      </section>

      <section className="section course-band">
        <div className="container course-showcase">
          <Reveal><div className="course-copy"><span className="eyebrow">Start with a specialty</span><h2>Make the next station feel familiar.</h2><p>Explore focused learning pathways and practice cases designed for emergency medicine OSCEs.</p><Link className="btn btn-primary" href="/courses">Browse courses <ArrowRight size={16} /></Link></div></Reveal>
          <Reveal><article className="course-card"><div className="course-card-top"><span className="course-label">FEATURED LEARNING PATHWAY</span><Brain size={26} color="#9acbff" /></div><h3>MRCEM Neurology</h3><p>Prepare for the neurology stations that matter, with practical cases and examiner-focused guidance.</p><div className="course-meta"><span><BookOpen size={15} /> Topic and station hub</span><span><Clock3 size={15} /> Self-paced learning</span></div><Link className="btn btn-light" href="/neurology">Explore neurology <ArrowUpRight size={16} /></Link></article></Reveal>
        </div>
      </section>

      <section className="section case-section">
        <div className="container">
          <Reveal><div className="section-heading"><span className="eyebrow">Learn by doing</span><h2>Walk into the exam with a plan.</h2><p>Practise the communication, clinical thinking and prioritisation that emergency medicine stations call for.</p></div></Reveal>
          <FeaturedStations />
          <div style={{ textAlign: 'center', marginTop: 27 }}><Link className="btn btn-light" href="/practice">See all practice cases <ArrowRight size={15} /></Link></div>
        </div>
      </section>

      <section className="section how-section">
        <div className="container">
          <Reveal><div className="section-heading"><span className="eyebrow">A clear way forward</span><h2>Learn. Practise. Pass.</h2><p>Case-based stations, examiner-style questions and a clear structure to build your OSCE confidence.</p></div></Reveal>
          <div className="steps">
            {[['01', 'Learn the approach', 'Review focused teaching, key guidance and a reliable structure for the station.'], ['02', 'Practise the case', 'Work through realistic scenarios and develop your history-taking and decision-making.'], ['03', 'Build confidence', 'Review the examiner questions and marking points, then repeat the stations you find hardest.']].map(([number, title, text]) => <Reveal key={number}><article className="step"><span className="step-number">{number}</span><h3>{title}</h3><p>{text}</p></article></Reveal>)}
          </div>
        </div>
      </section>

      <section className="section quote-section">
        <div className="container quote-layout"><Reveal><div><span className="eyebrow">Made for the moment that counts</span><h2>Turn preparation into confident performance.</h2><p>From the first question to your final summary, build a thoughtful approach you can take into the room.</p></div></Reveal><Reveal><div className="quote-card"><blockquote>The goal isn’t to memorise a script. It’s to show clear thinking, safe priorities and patient-centred communication.</blockquote><div className="quote-person"><span className="icon-tile"><Stethoscope size={19} /></span><span><strong>The OSCEPASS approach</strong><small>Learn • Practise • Pass</small></span></div></div></Reveal></div>
      </section>

      <section className="cta-section"><div className="container cta-panel"><div><h2>Your next station starts here.</h2><p>Explore the learning pathways and practice cases available on OSCEPASS.</p></div><Link className="btn btn-primary" href="/signup">Get started <ArrowRight size={16} /></Link></div></section>
    </main>
    {videoOpen && <VideoModal onClose={() => setVideoOpen(false)} />}
  </SiteLayout>;
}

function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return <section className="page-hero"><div className="container"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></div></section>;
}

const courseIcons: Record<string, LucideIcon> = { brain: Brain, book: BookOpen, video: Video, clipboard: ClipboardCheck, heart: HeartPulse, stethoscope: Stethoscope, graduation: GraduationCap };

const plannedCourses = [
  { icon: Stethoscope, tag: 'OSCE pathway', title: 'Common Presentations in A&E', description: 'Planned: history, examination and management of common A&E presentations.', meta: 'Clinical structure and case practice' },
  { icon: FileText, tag: 'Study resources', title: 'Clinical Guidelines', description: 'Planned: guideline references added to each station as it is clinically reviewed.', meta: 'Reading and literature' },
  { icon: Video, tag: 'Live teaching', title: 'Live Teaching Sessions', description: 'Planned: live case discussion with examiners. Contact us to register interest.', meta: '1-to-1 or group sessions' },
  { icon: GraduationCap, tag: 'Learning support', title: 'Progress & Feedback', description: 'Planned: saved attempts, marks and improvement points.', meta: 'Student access' },
];

function Courses() {
  usePageMeta('Courses', 'Discover emergency medicine and MRCEM OSCE courses, with focused learning and practice pathways.');
  const courses = useCourses();
  return <SiteLayout><main><PageHero eyebrow="Explore our modules" title="Find the right next step for your preparation." intro="Choose a focused pathway, build your clinical approach and practise the stations that matter to your exam." />
    <section className="section"><div className="container">
      {courses.isPending && <LoadingGrid label="Loading courses" />}
      {courses.isError && <ErrorBlock error={courses.error} onRetry={() => courses.refetch()} />}
      {courses.isSuccess && courses.data.length === 0 && <EmptyBlock title="No courses are published yet">Check back soon, or contact us to ask about upcoming courses.</EmptyBlock>}
      <div className="content-grid">
        {courses.data?.map((course) => { const Icon = courseIcons[course.icon] ?? Brain; return <Reveal key={course.id}><article className="content-card"><span className="icon-tile"><Icon size={21} /></span><p className="eyebrow" style={{ margin: '17px 0 0', fontSize: '.65rem' }}>{course.tag}</p><h3>{course.title}</h3><p>{course.description}</p><p style={{ fontSize: '.75rem', color: '#74869a' }}>{course.meta}</p><Link className="btn btn-light" href={courseHref(course.slug)}>Explore <ArrowRight size={14} /></Link></article></Reveal>; })}
        {plannedCourses.map(({ icon: Icon, tag, title, description, meta }) => <Reveal key={title}><article className="content-card"><span className="icon-tile"><Icon size={21} /></span><p className="eyebrow" style={{ margin: '17px 0 0', fontSize: '.65rem' }}>{tag}</p><h3>{title}</h3><p>{description}</p><p style={{ fontSize: '.75rem', color: '#74869a' }}>{meta}</p><span className="soon-badge">Coming soon</span></article></Reveal>)}
      </div>
    </div></section>
  </main></SiteLayout>;
}

function EducationNotice() {
  return <p className="edu-notice" role="note">For education and exam practice only. Not clinical guidance; it does not replace local protocols, current guidelines or clinical judgement.</p>;
}

function StationCard({ station }: { station: StationSummary }) {
  return <Link className="case-card" href={`/neurology/${station.slug}`}>
    <div className="case-thumb"><img src={imageOf(station.imageUrl)} alt="" loading="lazy" /><span className="case-type">{station.category || 'OSCE station'}</span></div>
    <div className="case-content"><h3>{station.title}</h3><p>{station.summary}</p><span className="case-link">Open station <ArrowRight size={14} /></span></div>
  </Link>;
}

function Practice() {
  usePageMeta('OSCE practice cases', 'Search and browse practical MRCEM OSCE stations for emergency medicine.');
  const stations = useStations();
  const initial = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(initial.get('q') ?? '');
  const [topic, setTopic] = useState(initial.get('topic') ?? ALL_TOPICS);
  const all = stations.data ?? [];
  const categories = uniqueCategories(all);
  const category = categories.includes(topic) ? topic : ALL_TOPICS;
  const filtersActive = query.trim() !== '' || category !== ALL_TOPICS;
  const shown = filterStations(all, { query, category });
  const clearFilters = () => { setQuery(''); setTopic(ALL_TOPICS); };

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (category !== ALL_TOPICS) params.set('topic', category);
    const search = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
  }, [query, category]);

  return <SiteLayout><main><PageHero eyebrow="OSCE practice cases" title="Practise the cases. Find your structure." intro="Search the station library, filter by topic and open a case to start timed practice." />
    <section className="section"><div className="container">
      <div className="catalog-controls">
        <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Search practice cases</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by station, topic or presentation" data-testid="input-practice-search" /></label>
        {filtersActive && <button type="button" className="btn btn-light catalog-clear" onClick={clearFilters}><X size={15} aria-hidden="true" /> Clear filters</button>}
      </div>
      {stations.isPending && <LoadingGrid label="Loading stations" />}
      {stations.isError && <ErrorBlock error={stations.error} onRetry={() => stations.refetch()} />}
      {stations.isSuccess && <>
        <div className="topic-chips" role="group" aria-label="Filter by topic">
          <button type="button" className="topic-chip" aria-pressed={category === ALL_TOPICS} onClick={() => setTopic(ALL_TOPICS)} data-testid="chip-topic-all">All topics <span>{all.length}</span></button>
          {categories.map((item) => <button type="button" key={item} className="topic-chip" aria-pressed={category === item} onClick={() => setTopic(item)}>{item} <span>{all.filter((station) => station.category === item).length}</span></button>)}
        </div>
        <EducationNotice />
        <p className="catalog-count" role="status" aria-live="polite">{filtersActive ? `${shown.length} of ${all.length} stations` : `${all.length} ${all.length === 1 ? 'station' : 'stations'} available`}</p>
        {shown.length > 0 && <div className="case-grid">{shown.map((station) => <StationCard key={station.slug} station={station} />)}</div>}
        {all.length === 0 && <div className="catalog-empty"><ClipboardCheck size={24} aria-hidden="true" /><h3>No stations are published yet</h3><p>New stations appear here once their content has been prepared and reviewed.</p><Link className="btn btn-light" href="/neurology">Browse the neurology topic list</Link></div>}
        {all.length > 0 && shown.length === 0 && <div className="catalog-empty"><Search size={24} aria-hidden="true" /><h3>{query.trim() ? `No stations match “${query.trim()}”` : `No stations in ${category} yet`}</h3><p>Check the spelling, try a shorter search, or choose another topic. The full topic list is on the neurology page.</p><div className="catalog-empty-actions"><button type="button" className="btn btn-primary" onClick={clearFilters}>Show all stations</button><Link className="btn btn-light" href="/neurology">Browse the topic list</Link></div></div>}
      </>}
    </div></section></main></SiteLayout>;
}

function Resources() {
  usePageMeta('Student resources', 'Study materials and the MRCEM neurology curriculum outline for A&E OSCE preparation.');
  const resources = [
    { icon: BookOpen, title: 'Reading & Literature', text: 'The neurology curriculum outline and topic list to read before you practise.', label: 'Study materials', href: '/neurology', soon: false },
    { icon: FileText, title: 'Clinical Guidelines', text: 'Planned: guideline references added to each station as it is clinically reviewed.', label: 'Guidance', href: '/neurology', soon: true },
    { icon: Video, title: 'Teaching Videos', text: 'Planned: short teaching videos for common A&E presentations.', label: 'Video library', href: '/courses', soon: true },
    { icon: ClipboardCheck, title: 'Examiner questions and marking', text: 'Each neurology station includes examiner questions and a marking scheme.', label: 'Practice support', href: '/practice', soon: false },
  ];
  return <SiteLayout><main><PageHero eyebrow="Student resources" title="Good preparation begins before the station." intro="Browse the study materials and practice stations that help you build a clear clinical approach." />
    <section className="section"><div className="container"><div className="content-grid">{resources.map(({ icon: Icon, title, text, label, href, soon }) => <Reveal key={title}><article className="content-card"><span className="icon-tile"><Icon size={21} /></span><p className="eyebrow" style={{ margin: '17px 0 0', fontSize: '.65rem' }}>{label}</p><h3>{title}</h3><p>{text}</p>{soon ? <span className="soon-badge">Coming soon</span> : <Link className="btn btn-light" href={href}>Browse resources <ArrowRight size={14} /></Link>}</article></Reveal>)}</div>
      <div style={{ marginTop: 45, padding: '26px 28px', background: '#edf6ff', borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}><div><span className="eyebrow">A focused place to start</span><h2 style={{ color: 'var(--navy)', margin: '11px 0 6px', fontSize: '1.5rem', letterSpacing: '-.04em' }}>MRCEM Neurology topics and OSCE stations</h2><p style={{ color: '#5c7086', margin: 0 }}>Open the topic hub for the ready-to-practise stations.</p></div><Link className="btn btn-primary" href="/neurology">Open neurology hub <ArrowRight size={15} /></Link></div>
    </div></section></main></SiteLayout>;
}

function About() {
  usePageMeta('About OSCEPASS', 'Learn about OSCEPASS and its practical emergency medicine OSCE preparation approach.');
  return <SiteLayout><main><PageHero eyebrow="About OSCEPASS" title="Preparation made practical." intro="OSCEPASS brings case-based emergency medicine stations, examiner-style questions and structured practice into one learning experience." />
    <section className="section"><div className="container quote-layout"><Reveal><div><span className="eyebrow">The learning approach</span><h2 style={{ color: 'var(--navy)', fontSize: '2.6rem', lineHeight: 1.1, letterSpacing: '-.05em' }}>Make the clinical reasoning visible.</h2><p style={{ color: '#5e7187', lineHeight: 1.8 }}>OSCEPASS is built for learners preparing for A&amp;E and MRCEM OSCEs. It connects teaching material, reading and case-based stations with a chance to practise the communication and decision-making the station asks of you.</p><p style={{ color: '#5e7187', lineHeight: 1.8 }}>Our aim is a calmer, more deliberate preparation process: understand the task, find a safe structure, and communicate your plan clearly.</p><Link className="btn btn-primary" href="/courses">Explore learning modules <ArrowRight size={16} /></Link></div></Reveal>
      <Reveal><div className="course-card"><span className="course-label">LEARN • PRACTISE • PASS</span><h3>Case-based stations. Examiner questions. Clear structure.</h3><p>Prepare for the station, not just the syllabus.</p><div className="course-meta"><span><CheckCircle2 size={15} /> Case-based learning</span><span><CheckCircle2 size={15} /> Examiner perspective</span><span><CheckCircle2 size={15} /> Timed practice</span></div></div></Reveal></div></section>
  </main></SiteLayout>;
}

function Contact() {
  usePageMeta('Contact', 'Contact the OSCEPASS team about learning pathways, student access and examiner sessions.');
  const [opened, setOpened] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `OSCEPASS enquiry: ${String(data.get('topic') ?? '')}`;
    const body = `${String(data.get('message') ?? '')}\n\nFrom: ${String(data.get('name') ?? '')} (${String(data.get('email') ?? '')})`;
    window.location.href = `mailto:hello@oscepass.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  }
  return <SiteLayout><main><PageHero eyebrow="Contact" title="Tell us what you’re preparing for." intro="Questions about courses, student access or examiner sessions? Write to the OSCEPASS team." />
    <section className="section"><div className="container form-layout"><div className="form-copy"><span className="eyebrow" style={{ color: '#a7d2ff' }}>We’re here to help</span><h2>Let’s make your next step clear.</h2><p>Send a message about learning pathways, practice cases or teaching sessions.</p><p style={{ marginTop: 26 }}><strong style={{ color: '#fff' }}>Email</strong><br /><a href="mailto:hello@oscepass.com" style={{ color: '#b9d9fb', textDecoration: 'none' }}>hello@oscepass.com</a></p></div>
      <form className="form-box" onSubmit={submit}><h2>Write to us</h2><p>This form prepares an email in your own email app. Nothing is sent until you press Send there.</p><div className="form-field"><label htmlFor="contact-name">Your name</label><input id="contact-name" name="name" autoComplete="name" required /></div><div className="form-field"><label htmlFor="contact-email">Email address</label><input id="contact-email" name="email" type="email" autoComplete="email" required /></div><div className="form-field"><label htmlFor="contact-topic">What can we help with?</label><select id="contact-topic" name="topic"><option>Course information</option><option>OSCE practice cases</option><option>Examiner sessions</option><option>Student access</option><option>Other</option></select></div><div className="form-field"><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" required /></div><button className="btn btn-primary" type="submit">Open in my email app <ArrowRight size={15} /></button>{opened && <div className="notice" role="status">Your email app should now open with the message ready. If it did not, write to hello@oscepass.com directly.</div>}</form>
    </div></section></main></SiteLayout>;
}

function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup';
  usePageMeta(signup ? 'Create your account' : 'Student login', 'Learner accounts for OSCEPASS are not open yet.');
  return <SiteLayout><main className="auth-wrap"><div className="auth-card">
    <span className="eyebrow">{signup ? 'Join OSCEPASS' : 'Student login'}</span><h1>Learner accounts are not open yet.</h1>
    <p>Practice stations are open to everyone now, with no account needed. Saved attempts and progress will arrive with student accounts. Contact us if you would like to hear when they open.</p>
    <div className="hero-actions" style={{ marginTop: 18 }}><Link className="btn btn-primary" href="/practice">Browse practice stations <ArrowRight size={15} /></Link><Link className="btn btn-light" href="/contact">Register interest</Link></div>
  </div></main></SiteLayout>;
}

function CoursePage({ slug }: { slug: string }) {
  const course = useCourse(slug);
  usePageMeta(course.data?.title ?? 'Course', course.data?.description || 'Topics and OSCE stations for emergency medicine learners.');
  if (course.isPending) return <SiteLayout><main><LoadingBlock label="Loading course" /></main></SiteLayout>;
  if (course.isError) return course.error instanceof ApiError && course.error.status === 404 ? <NotFound /> : <SiteLayout><main><ErrorBlock error={course.error} onRetry={() => course.refetch()} /></main></SiteLayout>;
  const data = course.data;
  const published = new Set(data.stations.map((station) => station.slug));
  return <SiteLayout><main><section className="neurology-hero"><div className="container"><span className="eyebrow" style={{ color: '#9bcaff' }}>{data.tag || 'Learning area'}</span><h1>{data.title}</h1><p>{data.description}</p></div></section>
    <section className="section" style={{ background: '#f3f8ff' }}><div className="container neurology-layout"><div className="neurology-main"><Reveal><div className="section-heading"><span className="eyebrow">Topic list and stations</span><h2>Work through the topics, one station at a time.</h2><p>{data.stations.length} {data.stations.length === 1 ? 'station is' : 'stations are'} ready to practise. Other topics will follow in the same format.</p></div></Reveal>
      {data.groups.length === 0 && <EmptyBlock title="No topics have been added yet">Check back soon.</EmptyBlock>}
      {data.groups.map((group) => <details className="topic-card" key={group.id}><summary>{group.name}</summary><div className="topic-card-body"><ul>{group.topics.map((topic) => <li key={topic.title}>{topic.stationSlug && published.has(topic.stationSlug) ? <><Link href={`/neurology/${topic.stationSlug}`}>{topic.title}, OSCE station</Link> <span>(ready)</span></> : topic.title}</li>)}</ul></div></details>)}
      {slug === 'mrcem-neurology' && <p style={{ color: '#697c90', fontSize: '.78rem', marginTop: 19 }}>Based on the RCEM curriculum and typical MRCEM content. Check the current RCEM syllabus.</p>}
     </div><aside className="neurology-side"><h3>Ready-to-practise stations</h3>{data.stations.length === 0 && <p style={{ color: '#697c90', fontSize: '.84rem' }}>No stations are published yet.</p>}{data.stations.map((station) => <Link key={station.slug} href={`/neurology/${station.slug}`}>{station.title} <ChevronRight size={13} style={{ float: 'right' }} /></Link>)}<Link href="/practice" style={{ color: '#0874d5', fontWeight: 700, border: 0, marginTop: 6 }}>All practice cases <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></Link></aside></div><div className="container"><CourseMediaSection assets={data.assets ?? []} /></div></section>
  </main></SiteLayout>;
}

function NeurologyPage() { return <CoursePage slug="mrcem-neurology" />; }
function CourseRoute() { const params = useParams<{ slug: string }>(); return <CoursePage slug={params.slug ?? ''} />; }

function StationPage() {
  const params = useParams<{ station: string }>();
  const station = useStation(params.station);
  usePageMeta(station.data?.title ?? 'Neurology station', station.data ? `${station.data.title}: ${station.data.summary || 'MRCEM OSCE station for emergency medicine.'}` : 'MRCEM neurology OSCE station for emergency medicine.');
  if (station.isPending) return <SiteLayout><main><LoadingBlock label="Loading station" /></main></SiteLayout>;
  if (station.isError) return station.error instanceof ApiError && station.error.status === 404 ? <NotFound /> : <SiteLayout><main><ErrorBlock error={station.error} onRetry={() => station.refetch()} /></main></SiteLayout>;
  return <SiteLayout><main><StationView key={station.data.slug} station={station.data} /></main></SiteLayout>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={Home} />
    <Route path="/courses" component={Courses} />
    <Route path="/practice" component={Practice} />
    <Route path="/resources" component={Resources} />
    <Route path="/about" component={About} />
    <Route path="/contact" component={Contact} />
    <Route path="/login">{() => <AuthPage mode="login" />}</Route>
    <Route path="/signup">{() => <AuthPage mode="signup" />}</Route>
    <Route path="/neurology" component={NeurologyPage} />
    <Route path="/courses/:slug" component={CourseRoute} />
    <Route path="/admin">{() => <Suspense fallback={<LoadingBlock label="Loading admin" />}><AdminPage /></Suspense>}</Route>
    <Route path="/neurology/:station" component={StationPage} />
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
