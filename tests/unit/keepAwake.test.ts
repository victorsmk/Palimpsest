import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

// Supabase pauses a free project after about a week without activity. Vercel calls /api/health once a day (vercel.json),
// and that request reads the database and asks Supabase's sign-in service, which is the activity that keeps it awake.

interface VercelConfig {
  crons?: { path: string; schedule: string }[];
}

const config = JSON.parse(readFileSync('vercel.json', 'utf-8')) as VercelConfig;

describe('keeping the free Supabase project awake', () => {
  it('has a daily call to the health page', () => {
    expect(config.crons).toHaveLength(1);
    const [cron] = config.crons!;
    expect(cron.path).toBe('/api/health');
    // Five fields: minute hour day-of-month month day-of-week. A free Vercel plan allows a job to run once a day, no more.
    const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.schedule.split(' ');
    expect(cron.schedule.split(' ')).toHaveLength(5);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(['*', '*', '*']);
  });

  it('calls a page that exists and that touches the database and the sign-in service', () => {
    expect(existsSync('app/api/health/route.ts')).toBe(true);
    const health = readFileSync('lib/server/api/health.ts', 'utf-8');
    expect(health).toContain('select 1 from poems limit 1');
    expect(health).toContain('/auth/v1/health');
  });
});
