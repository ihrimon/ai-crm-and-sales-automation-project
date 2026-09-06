'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Fragment } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationBell } from '@/components/notification-bell';
import type { Session } from '@/lib/session';

const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  deals: 'Deals',
  pipeline: 'Pipeline',
  contacts: 'Contacts',
  companies: 'Companies',
  tasks: 'Tasks',
  automations: 'Automations',
  approvals: 'Approvals',
  notifications: 'Notifications',
  team: 'Team',
  'audit-log': 'Audit Log',
  settings: 'Settings',
};

function segmentLabel(segment: string, isLast: boolean, parent?: string): string {
  if (LABELS[segment]) return LABELS[segment];
  if (isLast && (parent === 'leads' || parent === 'deals')) return 'Details';
  return segment;
}

export function SiteHeader({ session }: { session: Session }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex w-full items-center gap-1 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {segments.length === 0 ? (
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              segments.map((segment, i) => {
                const href = `/${segments.slice(0, i + 1).join('/')}`;
                const isLast = i === segments.length - 1;
                const label = segmentLabel(segment, isLast, segments[i - 1]);
                return (
                  <Fragment key={href}>
                    <BreadcrumbItem>
                      {isLast ? (
                        <BreadcrumbPage>{label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <Link href={href}>{label}</Link>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {!isLast && <BreadcrumbSeparator />}
                  </Fragment>
                );
              })
            )}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell session={session} />
        </div>
      </div>
    </header>
  );
}
