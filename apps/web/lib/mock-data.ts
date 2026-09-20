import type {
  Activity,
  ActivityType,
  AuditLog,
  Company,
  Contact,
  DashboardMetrics,
  Deal,
  Lead,
  LeadStatus,
  Notification,
  PipelineStage,
  Task,
  TaskStatus,
} from '@ai-crm/types';

// Realistic-looking sample data shown when the real backend has nothing yet
// (a freshly onboarded organization) so the dashboard-style UI never renders
// empty. Every generator returns objects typed exactly like the real API
// responses so swapping real data back in later is seamless.

const COMPANY_POOL = [
  { name: 'Northwind Logistics', industry: 'Logistics', size: '51-200' },
  { name: 'Bluepeak Analytics', industry: 'Software', size: '11-50' },
  { name: 'Fernbridge Capital', industry: 'Finance', size: '201-500' },
  { name: 'Solace Health Group', industry: 'Healthcare', size: '501-1000' },
  { name: 'Kestrel Manufacturing', industry: 'Manufacturing', size: '201-500' },
  { name: 'Ironvale Retail Co.', industry: 'Retail', size: '51-200' },
  { name: 'Cedarline Media', industry: 'Media', size: '11-50' },
  { name: 'Brightwell Energy', industry: 'Energy', size: '1000+' },
  { name: 'Harborstone Insurance', industry: 'Insurance', size: '201-500' },
  { name: 'Meridian Foodworks', industry: 'Food & Beverage', size: '51-200' },
  { name: 'Alderbrook Realty', industry: 'Real Estate', size: '11-50' },
  { name: 'Fenwick Robotics', industry: 'Manufacturing', size: '51-200' },
];

const FIRST_NAMES = [
  'Ayesha', 'Daniel', 'Priya', 'Marcus', 'Elena', 'Tom', 'Sara', 'Jamal',
  'Nadia', 'Kevin', 'Lucia', 'Omar', 'Grace', 'Ben', 'Farah', 'Ivan',
  'Chloe', 'Ravi', 'Megan', 'Yusuf', 'Hana', 'Carlos', 'Zoe', 'Amir',
];
const LAST_NAMES = [
  'Rahman', 'Whitfield', 'Sharma', 'Douglas', 'Novak', 'Bennett', 'Osei',
  'Khan', 'Larsen', 'Mercer', 'Alvarez', 'Farooq', 'Turner', 'Okafor',
  'Pham', 'Sokolov', 'Reyes', 'Iyer', 'Walsh', 'Aziz', 'Kim', 'Delgado',
];
const JOB_TITLES = [
  'VP of Sales', 'Head of Operations', 'Procurement Manager', 'CTO', 'CFO',
  'Marketing Director', 'IT Manager', 'Founder', 'COO', 'Purchasing Lead',
];
const LEAD_SOURCES = ['Website', 'Referral', 'LinkedIn', 'Cold Outreach', 'Webinar', 'Trade Show'];
const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];
const LOST_REASONS = ['Budget too small', 'Chose a competitor', 'No longer a priority', 'Went quiet'];

let seedCounter = 1;
function nextId(prefix: string): string {
  seedCounter += 1;
  return `mock-${prefix}-${seedCounter.toString(36)}`;
}

function pick<T>(pool: T[], index: number): T {
  return pool[index % pool.length]!;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

export function generateMockCompanies(count = 8): Company[] {
  return Array.from({ length: count }, (_, i) => {
    const c = pick(COMPANY_POOL, i);
    const now = daysAgo(90 - i * 3);
    return {
      id: nextId('company'),
      organizationId: 'mock-org',
      name: c.name,
      website: `https://${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.com`,
      industry: c.industry,
      companySize: c.size,
      createdAt: now,
      updatedAt: daysAgo(Math.max(0, 20 - i)),
    } satisfies Company;
  });
}

export function generateMockContacts(companies: Company[], count = 12): Contact[] {
  return Array.from({ length: count }, (_, i) => {
    const first = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 3);
    const company = companies.length ? pick(companies, i) : null;
    return {
      id: nextId('contact'),
      organizationId: 'mock-org',
      companyId: company?.id ?? null,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${company ? company.name.toLowerCase().replace(/[^a-z]+/g, '') : 'example'}.com`,
      phone: `+1 (${200 + i}) 555-01${(10 + i).toString().padStart(2, '0')}`,
      position: pick(JOB_TITLES, i),
      preferredChannel: pick(['EMAIL', 'PHONE', 'SMS'], i),
      createdAt: daysAgo(80 - i * 2),
      updatedAt: daysAgo(Math.max(0, 15 - i)),
    } satisfies Contact;
  });
}

export function generateMockLeads(companies: Company[], contacts: Contact[], count = 24): Lead[] {
  return Array.from({ length: count }, (_, i) => {
    const first = pick(FIRST_NAMES, i + 7);
    const last = pick(LAST_NAMES, i + 11);
    const company = companies.length ? pick(companies, i) : null;
    const status = pick(LEAD_STATUSES, i);
    const isLost = status === 'LOST';
    return {
      id: nextId('lead'),
      organizationId: 'mock-org',
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${company ? company.name.toLowerCase().replace(/[^a-z]+/g, '') : 'mail'}.com`,
      phone: `+1 (${300 + i}) 555-02${(10 + i).toString().padStart(2, '0')}`,
      source: pick(LEAD_SOURCES, i),
      status,
      industry: company?.industry ?? pick(COMPANY_POOL, i).industry,
      jobTitle: pick(JOB_TITLES, i + 2),
      budget: 5000 + (i % 9) * 3500,
      score: status === 'UNQUALIFIED' ? 20 + (i % 15) : 45 + (i % 55),
      lostReason: isLost ? pick(LOST_REASONS, i) : null,
      lastContactedAt: daysAgo(2 + (i % 20)),
      nextFollowUpDate: isLost ? null : daysFromNow(1 + (i % 10)),
      ownerId: null,
      contactId: contacts.length ? pick(contacts, i).id : null,
      companyId: company?.id ?? null,
      createdAt: daysAgo(60 - i),
      updatedAt: daysAgo(Math.max(0, 10 - (i % 10))),
    } satisfies Lead;
  });
}

export function generateMockPipelineStages(): PipelineStage[] {
  const names: Array<[string, boolean, boolean]> = [
    ['Prospecting', false, false],
    ['Qualified', false, false],
    ['Proposal Sent', false, false],
    ['Negotiation', false, false],
    ['Closed Won', true, false],
    ['Closed Lost', false, true],
  ];
  return names.map(([name, isWon, isLost], order) => ({
    id: nextId('stage'),
    pipelineId: 'mock-pipeline',
    name,
    order,
    isWon,
    isLost,
  }));
}

export function generateMockDeals(stages: PipelineStage[], companies: Company[], count = 18): Deal[] {
  return Array.from({ length: count }, (_, i) => {
    const stage = stages.length ? pick(stages, i) : undefined;
    const company = companies.length ? pick(companies, i + 2) : null;
    const isLost = stage?.isLost ?? false;
    return {
      id: nextId('deal'),
      organizationId: 'mock-org',
      leadId: null,
      contactId: null,
      companyId: company?.id ?? null,
      pipelineStageId: stage?.id ?? 'mock-stage',
      ownerId: null,
      title: `${company?.name ?? 'New Account'} — ${pick(['Platform License', 'Annual Contract', 'Expansion Deal', 'Pilot Program', 'Renewal'], i)}`,
      value: 8000 + (i % 12) * 6500,
      currency: 'USD',
      probability: isLost ? 0 : 20 + (i % 8) * 10,
      expectedCloseDate: isLost ? null : daysFromNow(5 + (i % 45)),
      lostReason: isLost ? pick(LOST_REASONS, i) : null,
      createdAt: daysAgo(70 - i * 2),
      updatedAt: daysAgo(Math.max(0, 12 - (i % 12))),
    } satisfies Deal;
  });
}

export function generateMockTasks(count = 10): Task[] {
  const titles = [
    'Follow up on proposal', 'Send pricing sheet', 'Schedule demo call', 'Check in after trial',
    'Prepare contract draft', 'Confirm renewal terms', 'Send onboarding guide', 'Review open questions',
    'Introduce to CSM', 'Share case study',
  ];
  const statuses: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];
  return Array.from({ length: count }, (_, i) => ({
    id: nextId('task'),
    organizationId: 'mock-org',
    leadId: null,
    contactId: null,
    companyId: null,
    dealId: null,
    assignedToId: null,
    title: pick(titles, i),
    status: i < 2 ? 'DONE' : pick(statuses, i),
    dueDate: daysFromNow(-2 + i),
    createdAt: daysAgo(20 - i),
    updatedAt: daysAgo(Math.max(0, 5 - i)),
  } satisfies Task));
}

export function generateMockActivities(count = 6): Activity[] {
  const types: ActivityType[] = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STAGE_CHANGE'];
  const notes = [
    'Discussed budget and timeline for Q3 rollout.',
    'Sent follow-up email with pricing breakdown.',
    'Demo went well — requested a technical deep dive next.',
    'Left voicemail, will try again tomorrow.',
    'Moved to Negotiation after verbal agreement on scope.',
    'Shared case study relevant to their industry.',
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: nextId('activity'),
    organizationId: 'mock-org',
    leadId: null,
    contactId: null,
    companyId: null,
    dealId: null,
    createdById: null,
    type: pick(types, i),
    notes: pick(notes, i),
    occurredAt: daysAgo(i * 2),
  } satisfies Activity));
}

export function generateMockDashboardMetrics(): DashboardMetrics {
  return {
    totalLeads: 128,
    qualifiedLeads: 46,
    openDeals: 23,
    wonDeals: 17,
    lostDeals: 9,
    pipelineValue: 486500,
    conversionRate: 13.3,
    leadsTrend: generateMockTrend(14).map(({ date, leads }) => ({ date, leads })),
  };
}

export interface TrendPoint {
  date: string;
  leads: number;
  deals: number;
  revenue: number;
}

export function generateMockTrend(days = 14): TrendPoint[] {
  let leadBase = 4;
  let dealBase = 1;
  let revenueBase = 6000;
  return Array.from({ length: days }, (_, i) => {
    leadBase = Math.max(1, leadBase + Math.round(Math.sin(i / 2) * 2 + (i % 3 === 0 ? 1 : -1)));
    dealBase = Math.max(0, dealBase + (i % 4 === 0 ? 1 : 0) - (i % 7 === 0 ? 1 : 0));
    revenueBase = Math.max(1500, revenueBase + Math.round(Math.cos(i / 3) * 1800 + 400));
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      leads: leadBase,
      deals: dealBase,
      revenue: revenueBase,
    };
  });
}

export function generateMockNotifications(count = 6): Notification[] {
  const types = ['LEAD_ASSIGNED', 'DEAL_WON', 'AUTOMATION_APPROVAL_NEEDED', 'TASK_DUE', 'NEW_LEAD'];
  return Array.from({ length: count }, (_, i) => ({
    id: nextId('notification'),
    organizationId: 'mock-org',
    recipientMemberId: 'mock-member',
    type: pick(types, i),
    payload: i === 2 ? { automationName: 'Auto-assign hot leads' } : null,
    isRead: i > 2,
    createdAt: daysAgo(i),
  } satisfies Notification));
}

export function generateMockAuditLogs(count = 10): AuditLog[] {
  const actions: AuditLog['action'][] = ['CREATE', 'UPDATE', 'DELETE'];
  const entityTypes = ['Lead', 'Deal', 'Contact', 'Company', 'Task'];
  return Array.from({ length: count }, (_, i) => ({
    id: nextId('audit'),
    organizationId: 'mock-org',
    actorUserId: nextId('user'),
    entityType: pick(entityTypes, i),
    entityId: nextId('entity'),
    action: pick(actions, i),
    oldValue: null,
    newValue: null,
    createdAt: daysAgo(i * 1.5),
  } satisfies AuditLog));
}
