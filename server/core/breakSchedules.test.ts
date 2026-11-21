import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBreakPlans } from './breakSchedules';
import { getTodayDateKey } from './dates';
import { parseScheduledDateTime } from './breaks';

test('break program accepts editable screenshot times and sorts chronologically', () => {
  const result = validateBreakPlans([{ scheduledTime: '17:00', durationMinutes: 15 }, { scheduledTime: '13:00', durationMinutes: 15 }, { scheduledTime: '14:15', durationMinutes: 30 }, { scheduledTime: '15:45', durationMinutes: 15 }]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.plans.map((plan) => plan.scheduledTime), ['13:00', '14:15', '15:45', '17:00']);
});
test('break program validates every row before applying any plan', () => {
  for (const scheduledTime of ['24:00', '13:60', '9:30', '']) assert.ok(validateBreakPlans([{scheduledTime,durationMinutes:15}]).error);
  assert.deepEqual(validateBreakPlans([{scheduledTime:'13:00',durationMinutes:15},{scheduledTime:'14:00',durationMinutes:2}]).plans, []);
  assert.ok(validateBreakPlans([{scheduledTime:'13:00',durationMinutes:15.5}]).error);
});
test('overlapping, duplicate and midnight programs are rejected; adjacent breaks are allowed', () => {
  assert.ok(validateBreakPlans([{scheduledTime:'13:00',durationMinutes:30},{scheduledTime:'13:15',durationMinutes:15}]).error);
  assert.ok(validateBreakPlans([{scheduledTime:'13:00',durationMinutes:15}],[{scheduledTime:'13:00',durationMinutes:15}]).error);
  assert.ok(validateBreakPlans([{scheduledTime:'00:10',durationMinutes:15}],[{scheduledTime:'23:50',durationMinutes:30}]).error);
  assert.equal(validateBreakPlans([{scheduledTime:'13:30',durationMinutes:15}],[{scheduledTime:'13:00',durationMinutes:30}]).error, undefined);
});
test('break day and planned times use Istanbul regardless of the server timezone', () => {
  assert.equal(getTodayDateKey(new Date('2026-11-21T22:30:00Z')), '2026-11-22');
  assert.equal(parseScheduledDateTime('2026-11-21','13:00').toISOString(), '2026-11-21T10:00:00.000Z');
});
