// 직원 픽셀 스프라이트(placeholder). 12×20, 아래가 의자 앉은 자리. 뒷모습은 책상을 보고 일하는 직원, 앞모습은 대표·임원석.
import { hex, shade, type Col } from './pixel';

// o 외곽선, h 머리, H 머리 그늘, s 피부, S 피부 그늘, e 눈, m 입, c 옷, C 옷 그늘, w 칼라, t 넥타이
const BACK_SHORT_A = [
  '............',
  '............',
  '............',
  '............',
  '....oooo....',
  '...ohhhho...',
  '..ohhhhhho..',
  '..ohhhhhHo..',
  '..ohhhhhHo..',
  '.sohhhhhHos.',
  '..ohhhhHHo..',
  '...oHHHHo...',
  '....oSSo....',
  '.occcccccco.',
  'occcccccccco',
  'oCcccccccCco',
  'oCccccccccCo',
  'oCccccccccCo',
  'oCCccccccCCo',
  '.oocccccooo.',
];

const BACK_SHORT_B = [
  ...BACK_SHORT_A.slice(0, 15),
  'oCcccccccCco',
  'ocCcccccccCo',
  'oCccccccccco',
  'oCCcccccccCo',
  '.oocccccooo.',
];

const BACK_LONG_A = [
  '............',
  '............',
  '............',
  '............',
  '....oooo....',
  '...ohhhho...',
  '..ohhhhhho..',
  '..ohhhhhHo..',
  '..ohhhhhHo..',
  '..ohhhhhHo..',
  '..ohhhhHHo..',
  '..ohhhhHHo..',
  '..oHHHHHHo..',
  '.occHHHHcco.',
  'occccHHcccco',
  'oCcccccccCco',
  'oCccccccccCo',
  'oCccccccccCo',
  'oCCccccccCCo',
  '.oocccccooo.',
];

const BACK_LONG_B = [...BACK_LONG_A.slice(0, 15), 'oCcccccccCco', 'ocCcccccccCo', 'oCccccccccco', 'oCCcccccccCo', '.oocccccooo.'];

const STRETCH = [
  'os........so',
  'oc........co',
  'oc........co',
  'oc..oooo..co',
  'oc.ohhhho.co',
  'ocohhhhhhoco',
  'ocohhhhhHoco',
  'ocohhhhhHoco',
  'ocshhhhHHsco',
  '.oohhhhHHoo.',
  '...oHHHHo...',
  '....oSSo....',
  '.occcccccco.',
  'occcccccccco',
  'occcccccccco',
  'oCcccccccCco',
  'oCccccccccCo',
  'oCccccccccCo',
  'oCCccccccCCo',
  '.oocccccooo.',
];

const FRONT_A = [
  '............',
  '............',
  '............',
  '............',
  '....oooo....',
  '...ohhhho...',
  '..ohhhhhho..',
  '..ohssssho..',
  '.sossssssos.',
  '..oseSSeso..',
  '..o' + 's'.repeat(6) + 'o..',
  '...osmmso...',
  '....oSSo....',
  '.occwttwcco.',
  'occcwttwccco',
  'oCcccttccCco',
  'sCccccccccCs',
  'ssCccccccCss',
  'oCCccccccCCo',
  '.oooooooooo.',
];

const FRONT_BLINK = FRONT_A.map((r, i) => (i === 9 ? '..osSSSSso..' : r));

export const SPRITES = { BACK_SHORT_A, BACK_SHORT_B, BACK_LONG_A, BACK_LONG_B, STRETCH, FRONT_A, FRONT_BLINK };
export const SPRITE_W = 12;
export const SPRITE_H = 20;

const HAIR = ['#2b1d16', '#4a3020', '#7a4b2a', '#c58b3c', '#1c1c24', '#8e8e96', '#b0452f', '#3a2a4a'];
const SKIN = ['#f5d0b0', '#eebe98', '#d9a27a', '#b97e57'];

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Look {
  pal: Record<string, Col>;
  long: boolean;
  phase: number;
}

// 직원마다 머리색·피부·머리 모양을 고정으로 고르고, 옷은 부서 색입니다.
export function lookFor(id: string, shirt: string, suit = false): Look {
  const h = hashStr(id);
  const hair = hex(HAIR[h % HAIR.length]);
  const skin = hex(SKIN[(h >>> 4) % SKIN.length]);
  const cloth = hex(suit ? '#2c3a5c' : shirt);
  return {
    long: ((h >>> 8) & 3) === 0,
    phase: ((h >>> 12) % 1000) / 1000,
    pal: {
      o: hex('#2a2233'),
      h: hair,
      H: shade(hair, 0.72),
      s: skin,
      S: shade(skin, 0.86),
      e: hex('#2a2233'),
      m: hex('#b5525a'),
      c: cloth,
      C: shade(cloth, 0.78),
      w: hex('#f4f4f4'),
      t: suit ? hex('#d23b3b') : cloth,
    },
  };
}
