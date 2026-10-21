// 직원 픽셀 얼굴(사무실 스프라이트와 같은 생김새). 모달·카드에서 씁니다.
import { useEffect, useRef } from 'react';
import { Pix } from './pixel';
import { SPRITES, lookFor } from './sprites';

export function PixelAvatar({ id, color, suit, size = 56 }: { id: string; color: string; suit?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const pix = new Pix(14, 14);
    const look = lookFor(id, color, suit);
    pix.sprite(1, -3, SPRITES.FRONT_A, look.pal);
    ctx.putImageData(pix.img, 0, 0);
  }, [id, color, suit]);
  return <canvas ref={ref} width={14} height={14} className="pixel-avatar" style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
}
