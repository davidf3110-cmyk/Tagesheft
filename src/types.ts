export type Horizon = 'kurz' | 'mittel' | 'lang';
export type GoalStatus = 'offen' | 'aktiv' | 'erreicht' | 'pausiert';

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  due?: string;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  horizon: Horizon;
  status: GoalStatus;
  targetDate?: string;
  milestones: Milestone[];
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  current: number; // 1–5
  target: number; // 1–5
  plan: string;
}

export type ApplicationStatus = 'idee' | 'beworben' | 'interview' | 'angebot' | 'absage';

export interface Application {
  id: string;
  company: string;
  position: string;
  status: ApplicationStatus;
  appliedOn?: string;
  nextStep?: string;
  nextStepDate?: string;
  link?: string;
  salary?: string;
  notes: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  text: string;
  mood: number; // 1–5
}

export interface Profile {
  name: string;
  currentRole: string;
  targetRole: string;
  vision: string;
  values: string[];
  strengths: string[];
}

export interface AppData {
  version: 1;
  profile: Profile;
  goals: Goal[];
  skills: Skill[];
  applications: Application[];
  journal: JournalEntry[];
}
