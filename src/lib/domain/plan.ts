export type Plan = "FREE" | "PRO";

export interface PlanLimits {
  maxEvents: number;
  maxFollows: number;
  maxCategories: number;
  maxRemindersPerEvent: number;
  quietHours: boolean;
  webPush: boolean; // background push server-side
  calendarFeed: boolean; // private auto-updating webcal feed
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxEvents: 40,
    maxFollows: 3,
    maxCategories: 12,
    maxRemindersPerEvent: 2,
    quietHours: false,
    webPush: true, // push itself is free; the value-add is scale/follows
    calendarFeed: true,
  },
  PRO: {
    maxEvents: 100000,
    maxFollows: 100000,
    maxCategories: 100000,
    maxRemindersPerEvent: 10,
    quietHours: true,
    webPush: true,
    calendarFeed: true,
  },
};

export function limitsFor(plan: string): PlanLimits {
  return PLAN_LIMITS[(plan as Plan) in PLAN_LIMITS ? (plan as Plan) : "FREE"];
}

/** Admins get Pro limits regardless of their billing plan. */
export function effectivePlan(plan: string, role: string): Plan {
  if (role === "ADMIN") return "PRO";
  return (plan as Plan) in PLAN_LIMITS ? (plan as Plan) : "FREE";
}

export const PRO_FEATURES = [
  "Unlimited events & follows",
  "Every source, all your teams",
  "Up to 10 reminders per event",
  "Quiet hours",
  "Priority sync",
];
