// 직원 픽셀 얼굴(16×16, 사람마다 머리 모양·눈·입·안경·옷이 다름, A-151). 모달·카드에서 씁니다.
import { useEffect, useRef } from 'react';
import { Pix } from './pixel';
import { FACE_W, drawFaceTo, type FaceExpr } from './face';

export function PixelAvatar({ id, color, suit, size = 56, expr }: { id: string; color: string; suit?: boolean; size?: number; expr?: FaceExpr }) {
  const ek = expr ? `${expr.eyes ?? ''}/${expr.brows ?? ''}/${expr.mouth ?? ''}` : '';
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const pix = new Pix(FACE_W, FACE_W);
    drawFaceTo(pix, id, color, suit, expr);
    ctx.putImageData(pix.img, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, color, suit, ek]);
  return <canvas ref={ref} width={FACE_W} height={FACE_W} className="pixel-avatar" style={{ width: size, height: size, imageRendering: 'pixelated' }} />;
}
