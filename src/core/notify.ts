// DT-04 알림(토스트·배지), UX-13 페이퍼뉴스, 화면 연출 이벤트. 상태 배열은 길이를 잘라 저장 크기를 묶습니다.
import { nextId } from './ids';
import type { GameState, NewsItem, Notice } from './types';

export function notify(s: GameState, text: string, kind: Notice['kind'] = 'info', app?: string, arg?: string) {
  s.notices.push({ id: nextId(s, 'n'), day: s.day, text, kind, app, arg, read: false });
  if (s.notices.length > 60) s.notices.splice(0, s.notices.length - 60);
  const sound = kind === 'good' ? 'success' : kind === 'bad' ? 'warn' : kind === 'urgent' ? 'warn' : kind === 'achievement' || kind === 'mission' ? 'levelup' : 'notify';
  s.events.push({ type: 'sfx', sound });
}

export function news(s: GameState, text: string, kind: NewsItem['kind']) {
  s.news.push({ day: s.day, text, kind });
  if (s.news.length > 120) s.news.splice(0, s.news.length - 120);
}

export function float(s: GameState, text: string, kind: 'good' | 'bad' | 'money', seat?: string) {
  s.events.push({ type: 'float', text, kind, seat });
}

export function sfx(s: GameState, sound: string) {
  s.events.push({ type: 'sfx', sound });
}
