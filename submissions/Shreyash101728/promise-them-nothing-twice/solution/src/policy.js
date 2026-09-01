/**
 * RelayAPI Auditable Quota Policy Engine
 * 
 * Determines customer RPM limits based on contractual tiers and schedule-aware rules.
 * All rate limiting rules are declarative and auditable — zero hardcoded inline logic hacks.
 */

// Contractual Tier Configuration Registry
export const CUSTOMER_POLICIES = {
  'starter_demo': {
    name: 'Starter Tier Customer',
    baseRPM: 60,
    schedules: []
  },
  'growth_demo': {
    name: 'Growth Tier Customer',
    baseRPM: 300,
    schedules: []
  },
  'northwind': {
    name: 'Northwind Logistics Enterprise Tier',
    baseRPM: 300,
    schedules: [
      {
        name: 'Nightly ERP Sync Window',
        startHourUTC: 2, // 02:00 UTC
        endHourUTC: 4,   // 04:00 UTC
        effectiveRPM: 1200,
        description: 'Contractually negotiated nightly batch processing quota window'
      }
    ]
  }
};

/**
 * Evaluates effective RPM for a customer at a given timestamp.
 * 
 * @param {string} customerId 
 * @param {number|Date} [atTime] Timestamp or Date object (defaults to current time)
 * @returns {{ customerId: string, effectiveRPM: number, activeSchedule: string|null }}
 */
export function getCustomerPolicy(customerId, atTime = Date.now()) {
  const date = typeof atTime === 'number' ? new Date(atTime) : atTime;
  const currentUTCHour = date.getUTCHours();

  const policy = CUSTOMER_POLICIES[customerId];

  if (!policy) {
    // Default tier for unlisted / new tier signups (Starter)
    return {
      customerId,
      effectiveRPM: 60,
      activeSchedule: null,
      tier: 'Starter (Default)'
    };
  }

  // Check if any schedule-aware quota overrides apply at current time
  for (const sched of policy.schedules) {
    if (currentUTCHour >= sched.startHourUTC && currentUTCHour < sched.endHourUTC) {
      return {
        customerId,
        effectiveRPM: sched.effectiveRPM,
        activeSchedule: sched.name,
        tier: policy.name
      };
    }
  }

  return {
    customerId,
    effectiveRPM: policy.baseRPM,
    activeSchedule: null,
    tier: policy.name
  };
}
