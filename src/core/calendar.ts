// DT-05 게임 달력: 시작일(time.json)에서 지난 날 수로 날짜를 계산합니다.
import time from '../data/time.json';

const start = Date.parse(time.startDate + 'T00:00:00Z');
const DAY = 86400000;

export function dateOf(day: number): Date {
  return new Date(start + day * DAY);
}

export function monthKey(day: number): string {
  const d = dateOf(day);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isFirstOfMonth(day: number): boolean {
  return dateOf(day).getUTCDate() === 1;
}

export function daysInMonthOf(day: number): number {
  const d = dateOf(day);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function formatDate(day: number): string {
  const d = dateOf(day);
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function formatMonth(key: string): string {
  const [y, m] = key.split('-');
  return `${y}년 ${Number(m)}월`;
}

// 근무 시간(09:00~18:00) 안의 현재 시각
export function clockOf(msInDay: number): string {
  const hours = time.workEndHour - time.workStartHour;
  const frac = Math.min(1, msInDay / time.dayMs);
  const total = time.workStartHour * 60 + Math.floor(frac * hours * 60);
  const h = Math.floor(total / 60);
  const m = Math.floor((total % 60) / 10) * 10;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
