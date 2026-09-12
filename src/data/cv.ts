import type { ImageMetadata } from 'astro';

// A plain string, or a link rendered as `text` pointing at `href` — used for
// the odd context/bullet line that should be clickable (a thesis, a talk,
// an RFC) without pulling in a full markdown parser for one line per line.
export type RichText = string | { text: string; href: string };

export interface TimelineEntry {
  title: string;
  /** Short label shown next to the date pill (e.g. "Acme Corp"). Pass '' to omit. */
  organization: string;
  /** The "at ..." line shown under the title. */
  context?: RichText;
  startDate: string;
  /** Omit for a single point-in-time entry (shows just startDate). */
  endDate?: string;
  bullets?: RichText[];
}

export interface SkillBarGroup {
  category: string;
  /** An optional smaller sub-label shown above this group's bars. */
  subheading?: string;
  skills: { name: string; level: number }[];
}

export interface Course {
  title: string;
  issuer: string;
  credentialId?: string;
  year: string;
  /** Certificate/proof image, shown in a lightbox when the card is clicked. */
  certificate?: ImageMetadata;
}

// A template literal with one sentence per line — purely for readability
// in this file. The rendered output is unaffected: HTML collapses newlines
// (like any other whitespace) down to a single space.
export const CV_SUMMARY = `TODO: replace with a short professional summary — a few sentences covering who you are, your focus area, and where you've worked or studied.
This is the first thing a reader sees on your CV page, so keep it tight.`;

export const CV_WORK_HISTORY: TimelineEntry[] = [
  {
    title: 'TODO: Your Job Title',
    organization: 'TODO: Company/Institution',
    context: 'at the TODO team, working on TODO',
    startDate: '2024 Jan',
    // Omit endDate for a current/ongoing position.
    bullets: [
      'TODO: a notable responsibility or achievement in this role',
      'TODO: another bullet point',
    ],
  },
  {
    title: 'TODO: Previous Job Title',
    organization: 'TODO: Previous Company',
    startDate: '2021 Jun',
    endDate: '2023 Dec',
    bullets: [
      'TODO: a notable responsibility or achievement in this role',
    ],
  },
];

export const CV_EDUCATION: TimelineEntry[] = [
  {
    title: 'Ph.D. in TODO Field',
    organization: 'TODO: University',
    startDate: '2018',
    endDate: '2022',
  },
  {
    title: 'M.Sc. in TODO Field',
    organization: 'TODO: University',
    startDate: '2016',
    endDate: '2018',
  },
];

// Talks, awards, press mentions — anything worth a single-line timeline
// entry that isn't a job or a degree.
export const CV_NOTABLE_MENTIONS: TimelineEntry[] = [
  {
    title: 'TODO: Talk/award/press mention title',
    organization: 'TODO: Venue or publication',
    startDate: '2024',
  },
];

export const CV_TEACHING: TimelineEntry[] = [
  {
    title: 'TODO: Course name',
    organization: 'TODO: Institution',
    startDate: '2023',
    endDate: '2024',
  },
];

export const CV_SKILL_GROUPS: SkillBarGroup[] = [
  {
    category: 'TODO: Skill Category One',
    skills: [
      { name: 'TODO: Skill A', level: 85 },
      { name: 'TODO: Skill B', level: 70 },
      { name: 'TODO: Skill C', level: 60 },
    ],
  },
  {
    category: 'TODO: Skill Category Two',
    skills: [
      { name: 'TODO: Skill D', level: 90 },
      { name: 'TODO: Skill E', level: 75 },
    ],
  },
  {
    category: 'Languages',
    skills: [
      { name: 'TODO: Native language', level: 100 },
      { name: 'English', level: 85 },
    ],
  },
];

export const CV_SOFT_SKILLS: string[] = [
  'TODO: Soft skill one',
  'TODO: Soft skill two',
  'TODO: Soft skill three',
];

// Hobbies aren't rated on a proficiency scale like the skill groups above —
// nobody has an "Advanced" in Travel — so they're a plain tag list, same as
// soft skills.
export const CV_HOBBIES: string[] = [
  'TODO: Hobby one',
  'TODO: Hobby two',
  'TODO: Hobby three',
];

export interface FunFact {
  label: string;
  value: string;
  icon: 'map' | 'github' | 'bug' | 'blog';
}

export const CV_FUN_FACTS: FunFact[] = [
  { label: 'TODO: metric label', value: 'TODO', icon: 'map' },
  { label: 'TODO: metric label', value: 'TODO', icon: 'github' },
  { label: 'TODO: metric label', value: 'TODO', icon: 'bug' },
  { label: 'TODO: metric label', value: 'TODO', icon: 'blog' },
];

// Optional "certificate" field on each entry accepts an imported image
// (shown in a lightbox when the card is clicked) — omit it for a course
// with no certificate image, as below.
export const CV_COURSES: Course[] = [
  {
    title: 'TODO: Course/certification name',
    issuer: 'TODO: Issuer',
    year: '2024',
  },
  {
    title: 'TODO: Another course/certification',
    issuer: 'TODO: Issuer',
    credentialId: 'TODO-CREDENTIAL-ID',
    year: '2023',
  },
];
