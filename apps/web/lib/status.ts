import type {
  AIAnalysisStatus,
  AutomationExecutionStatus,
  EmailDraftStatus,
  LeadStatus,
  OrgRole,
  TaskStatus,
} from '@ai-crm/types';

export type BadgeTone = 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';

export const LEAD_STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  NEW: 'secondary',
  CONTACTED: 'default',
  QUALIFIED: 'success',
  UNQUALIFIED: 'outline',
  CONVERTED: 'success',
  LOST: 'destructive',
};

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  UNQUALIFIED: 'Unqualified',
  CONVERTED: 'Converted',
  LOST: 'Lost',
};

export const TASK_STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  OPEN: 'secondary',
  IN_PROGRESS: 'default',
  DONE: 'success',
  CANCELLED: 'outline',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

export const ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  SALES_MANAGER: 'Sales Manager',
  SALES_REP: 'Sales Rep',
  VIEWER: 'Viewer',
};

export const AI_ANALYSIS_STATUS_TONE: Record<AIAnalysisStatus, BadgeTone> = {
  PENDING: 'secondary',
  COMPLETED: 'success',
  FAILED: 'destructive',
};

export const EMAIL_DRAFT_STATUS_TONE: Record<EmailDraftStatus, BadgeTone> = {
  PENDING: 'secondary',
  DRAFT: 'default',
  DISCARDED: 'outline',
  SENT_MANUALLY: 'success',
  FAILED: 'destructive',
};

export const EXECUTION_STATUS_TONE: Record<AutomationExecutionStatus, BadgeTone> = {
  EXECUTED: 'success',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  DISMISSED: 'outline',
  FAILED: 'destructive',
};

export function dealStageTone(stage: { isWon?: boolean; isLost?: boolean } | undefined): BadgeTone {
  if (!stage) return 'secondary';
  if (stage.isWon) return 'success';
  if (stage.isLost) return 'destructive';
  return 'default';
}

// Maps our semantic tones onto the shadcn Badge's `variant` prop plus a
// className override for the tones Badge doesn't natively support
// (success/warning use the CSS vars added in globals.css).
export function badgeClassName(tone: BadgeTone): string {
  switch (tone) {
    case 'success':
      return 'border-transparent bg-success text-success-foreground hover:bg-success/80';
    case 'warning':
      return 'border-transparent bg-warning text-warning-foreground hover:bg-warning/80';
    default:
      return '';
  }
}

export function badgeVariant(tone: BadgeTone): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (tone === 'success' || tone === 'warning') return 'default';
  return tone;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
