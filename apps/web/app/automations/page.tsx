'use client';

import type { Automation, AutomationActionType, AutomationTriggerType } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createAutomation, deleteAutomation, listAutomations, updateAutomation } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

const TRIGGER_TYPES: AutomationTriggerType[] = ['LEAD_CREATED', 'DEAL_STAGE_CHANGED', 'NO_RESPONSE', 'DEAL_WON'];
const ACTION_TYPES: AutomationActionType[] = ['SEND_EMAIL', 'CREATE_TASK', 'NOTIFY', 'CALL_AI'];
const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;

// FR-042 · docs/ui-ux/README.md §4 "/automations" screen (OWNER/ADMIN/
// SALES_MANAGER only). No dedicated wireframe exists for this one (only the
// Approval Queue got one, §5.5) — this follows the same list+create pattern
// established for /tasks and /leads.
export default function AutomationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
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
    if (!current) {
      router.replace('/login');
      return;
    }
    if (!current.organizationId) {
      router.replace('/onboarding');
      return;
    }
    setSession(current);
    void load(current);
  }, [router, load]);

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
      setShowNewForm(false);
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Automations</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowNewForm((v) => !v)}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            + New Automation
          </button>
          <Link href="/automations/approvals" className="text-sm underline">
            Approval Queue
          </Link>
          <Link href="/" className="text-sm text-neutral-500 underline">
            Back
          </Link>
        </div>
      </div>

      {showNewForm && (
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <input
            type="text"
            required
            placeholder="Automation name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)} className="flex-1 rounded border border-neutral-300 px-2 py-2 text-sm">
              {TRIGGER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={actionType} onChange={(e) => setActionType(e.target.value as AutomationActionType)} className="flex-1 rounded border border-neutral-300 px-2 py-2 text-sm">
              {ACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'CALL_AI' ? 'CALL_AI (requires approval)' : t}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useCondition} onChange={(e) => setUseCondition(e.target.checked)} />
            Only when a condition matches
          </label>
          {useCondition && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="field (e.g. budget)"
                value={conditionField}
                onChange={(e) => setConditionField(e.target.value)}
                className="flex-1 rounded border border-neutral-300 px-2 py-2 text-sm"
              />
              <select value={conditionOperator} onChange={(e) => setConditionOperator(e.target.value as (typeof CONDITION_OPERATORS)[number])} className="rounded border border-neutral-300 px-2 py-2 text-sm">
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="value"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                className="flex-1 rounded border border-neutral-300 px-2 py-2 text-sm"
              />
            </div>
          )}

          <button type="submit" disabled={isCreating} className="self-start rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {automations === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : automations.length === 0 ? (
        <p className="text-sm text-neutral-500">No automations yet — create one above.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">Name</th>
              <th className="py-2">Trigger</th>
              <th className="py-2">Action</th>
              <th className="py-2">Active</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {automations.map((automation) => (
              <tr key={automation.id} className="border-b border-neutral-100">
                <td className="py-2">{automation.name}</td>
                <td className="py-2">{automation.triggerType}</td>
                <td className="py-2">{automation.actionType}</td>
                <td className="py-2">
                  <button type="button" onClick={() => toggleActive(automation)} className="underline">
                    {automation.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="py-2">
                  <button type="button" onClick={() => handleDelete(automation.id)} className="text-red-600 underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
