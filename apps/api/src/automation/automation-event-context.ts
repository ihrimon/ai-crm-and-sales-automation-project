// The flat shape every trigger site (LeadService, DealService, the
// NO_RESPONSE sweep) builds and hands to AutomationTriggerService. `fields`
// is what conditionJson gets matched against (automation-condition.util.ts);
// `ownerId` is the lead/deal's current owner, used as the CREATE_TASK
// assignee / NOTIFY recipient.
export interface AutomationEventContext {
  leadId?: string;
  dealId?: string;
  ownerId?: string | null;
  fields: Record<string, unknown>;
}
