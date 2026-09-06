'use client';

import type { Automation, AutomationActionType, AutomationTriggerType } from '@ai-crm/types';
import { Plus, ShieldCheck, Trash2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, createAutomation, deleteAutomation, listAutomations, updateAutomation } from '@/lib/api';
import { readSession, type Session } from '@/lib/session';

const TRIGGER_TYPES: AutomationTriggerType[] = ['LEAD_CREATED', 'DEAL_STAGE_CHANGED', 'NO_RESPONSE', 'DEAL_WON'];
const ACTION_TYPES: AutomationActionType[] = ['SEND_EMAIL', 'CREATE_TASK', 'NOTIFY', 'CALL_AI'];
const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;

export default function AutomationsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('LEAD_CREATED');
  const [actionType, setActionType] = useState<AutomationActionType>('CREATE_TASK');
  const [useCondition, setUseCondition] = useState(false);
  const [conditionField, setConditionField] = useState('');
  const [conditionOperator, setConditionOperator] = useState<(typeof CONDITION_OPERATORS)[number]>('gte');
  const [conditionValue, setConditionValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async (current: Session) => {
    try {
      const result = await listAutomations(current.accessToken);
      setAutomations(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load automations.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current);
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      const conditionJson =
        useCondition && conditionField
          ? { field: conditionField, operator: conditionOperator, value: isNaN(Number(conditionValue)) ? conditionValue : Number(conditionValue) }
          : undefined;
      await createAutomation(session.accessToken, { name, triggerType, actionType, conditionJson });
      setName('');
      setConditionField('');
      setConditionValue('');
      setUseCondition(false);
      setDialogOpen(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create automation.');
    } finally {
      setIsCreating(false);
    }
  }

  async function toggleActive(automation: Automation) {
    if (!session) return;
    try {
      const updated = await updateAutomation(session.accessToken, automation.id, { isActive: !automation.isActive });
      setAutomations((prev) => (prev ? prev.map((a) => (a.id === updated.id ? updated : a)) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this automation.');
    }
  }

  async function handleDelete(automationId: string) {
    if (!session) return;
    try {
      await deleteAutomation(session.accessToken, automationId);
      setAutomations((prev) => (prev ? prev.filter((a) => a.id !== automationId) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this automation.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Automations"
        description="Rules that trigger actions automatically as your pipeline moves."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/automations/approvals">
                <ShieldCheck />
                Approval Queue
              </Link>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus />
                  New Automation
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Create a new automation</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="autoName">Name</Label>
                      <Input id="autoName" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1.5">
                        <Label>Trigger</Label>
                        <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AutomationTriggerType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRIGGER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t.replaceAll('_', ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Action</Label>
                        <Select value={actionType} onValueChange={(v) => setActionType(v as AutomationActionType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTION_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t === 'CALL_AI' ? 'Call AI (requires approval)' : t.replaceAll('_', ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={useCondition} onCheckedChange={(v) => setUseCondition(v === true)} />
                      Only when a condition matches
                    </label>
                    {useCondition && (
                      <div className="grid grid-cols-3 gap-2">
                        <Input placeholder="field" value={conditionField} onChange={(e) => setConditionField(e.target.value)} />
                        <Select value={conditionOperator} onValueChange={(v) => setConditionOperator(v as (typeof CONDITION_OPERATORS)[number])}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITION_OPERATORS.map((op) => (
                              <SelectItem key={op} value={op}>
                                {op}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input placeholder="value" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={isCreating}>
                      {isCreating ? 'Creating…' : 'Create'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {automations === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : automations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Zap className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No automations yet — create one above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((automation) => (
                  <TableRow key={automation.id}>
                    <TableCell className="font-medium">{automation.name}</TableCell>
                    <TableCell className="text-muted-foreground">{automation.triggerType.replaceAll('_', ' ')}</TableCell>
                    <TableCell className="text-muted-foreground">{automation.actionType.replaceAll('_', ' ')}</TableCell>
                    <TableCell>
                      <button type="button" onClick={() => toggleActive(automation)}>
                        <Badge variant={automation.isActive ? 'default' : 'outline'}>
                          {automation.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete(automation.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
