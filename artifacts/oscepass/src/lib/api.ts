import { useQuery } from '@tanstack/react-query';
import type { CourseAsset as GeneratedCourseAsset } from '@workspace/api-client-react';

export type PublishStatus = 'draft' | 'published';

export interface Course {
  id: number;
  slug: string;
  title: string;
  tag: string;
  description: string;
  meta: string;
  icon: string;
  imageUrl: string | null;
  status: PublishStatus;
  featured: boolean;
  showOnHome: boolean;
  sortOrder: number;
}

export interface TopicItem { title: string; stationSlug?: string }

export interface TopicGroup {
  id: number;
  courseId: number;
  name: string;
  topics: TopicItem[];
  sortOrder: number;
}

export interface StationSummary {
  id: number;
  slug: string;
  courseId: number;
  groupId: number | null;
  title: string;
  category: string;
  summary: string;
  imageUrl: string | null;
  featured: boolean;
  showOnHome: boolean;
  sortOrder: number;
}

export type Speaker = 'doctor' | 'patient' | 'witness' | 'note';

export interface StationContent {
  aim: string;
  learningOutcomes: string[];
  instructions: string;
  witnessLabel: string;
  timing: { historyMin: number; examinerMin: number };
  totalMarks: number;
  actorBriefs: { role: string; notes: string[]; items: string[]; table: { topic: string; response: string }[] }[];
  history: { title: string; lines: { speaker: Speaker; label?: string; text: string }[] }[];
  markScheme: { domain: string; expected?: string; max: number }[];
  globalRating: { grade: string; description: string }[];
  commonErrors: string[];
  examinerExpects: { task: string; expected: string }[];
  reactions: { situation: string; response: string }[];
  plainLanguage: { term: string; say: string }[];
  patientQuestions: { question: string; reply: string }[];
  howToAnswer: string[];
  redFlags: string[];
  questions: { question: string; answer: string }[];
  teachingPoints: string[];
  resources: { label: string; url?: string }[];
}

export interface StationDetail extends StationSummary {
  status: PublishStatus;
  content: StationContent;
}

export interface CourseDetail extends Course {
  groups: TopicGroup[];
  stations: StationSummary[];
  assets: CourseAsset[];
}

export type CourseAsset = GeneratedCourseAsset;

export const emptyContent = (): StationContent => ({
  aim: '',
  learningOutcomes: [],
  instructions: '',
  witnessLabel: 'Witness',
  timing: { historyMin: 8, examinerMin: 2 },
  totalMarks: 20,
  actorBriefs: [],
  history: [],
  markScheme: [],
  globalRating: [],
  commonErrors: [],
  examinerExpects: [],
  reactions: [],
  plainLanguage: [],
  patientQuestions: [],
  howToAnswer: [],
  redFlags: [],
  questions: [],
  teachingPoints: [],
  resources: [],
});

/** Fills anything an older or hand-written station is missing so the viewer never crashes. */
export function normaliseContent(raw: Partial<StationContent> | null | undefined): StationContent {
  const base = emptyContent();
  const merged = { ...base, ...(raw ?? {}) } as StationContent;
  merged.timing = { ...base.timing, ...(raw?.timing ?? {}) };
  return merged;
}

export interface ApiIssue { path: (string | number)[]; message: string }

export class ApiError extends Error {
  status: number;
  issues: ApiIssue[];
  constructor(status: number, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

const API = '/api';

export async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (!response.ok) {
    let payload: { error?: string; issues?: ApiIssue[] } = {};
    try { payload = await response.json(); } catch { /* non-JSON error body */ }
    throw new ApiError(response.status, payload.error ?? `Request failed (${response.status})`, payload.issues ?? []);
  }
  return response.json() as Promise<T>;
}

const retry = (count: number, error: unknown) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2;

export const useCourses = () => useQuery({ queryKey: ['courses'], queryFn: () => request<Course[]>('/courses'), retry });
export const useCourse = (slug: string) => useQuery({ queryKey: ['course', slug], queryFn: () => request<CourseDetail>(`/courses/${slug}`), retry });
export const useStations = () => useQuery({ queryKey: ['stations'], queryFn: () => request<StationSummary[]>('/stations'), retry });
export const useStation = (slug: string | undefined) =>
  useQuery({ queryKey: ['station', slug], queryFn: () => request<StationDetail>(`/stations/${slug}`), enabled: Boolean(slug), retry });

export const FALLBACK_IMAGE = '/brand/t1.jpg';
export const imageOf = (url: string | null | undefined) => url || FALLBACK_IMAGE;

/** Course route: the neurology course keeps its original address. */
export const courseHref = (slug: string) => (slug === 'mrcem-neurology' ? '/neurology' : `/courses/${slug}`);

/** Lower-cases and strips accents so "barre" matches "Barré". */
const normalise = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const ALL_TOPICS = 'All topics';

export function filterStations<T extends { title: string; category: string; summary: string }>(
  list: T[],
  { query, category }: { query: string; category: string },
): T[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  return list.filter((item) => {
    if (category !== ALL_TOPICS && item.category !== category) return false;
    if (!words.length) return true;
    const haystack = normalise(`${item.title} ${item.category} ${item.summary}`);
    return words.every((word) => haystack.includes(word));
  });
}

export const uniqueCategories = (list: { category: string }[]) => Array.from(new Set(list.map((item) => item.category).filter(Boolean)));
