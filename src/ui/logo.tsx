// 서비스 로고(산업 단계에서 고름): 배경색 + 흰 심볼. 심볼 이미지는 assets/logos/*.png
import type { ServiceInfo } from '../core/types';

const MARK_FILES = import.meta.glob<string>('../assets/logos/*.png', { eager: true, import: 'default' });
const MARK_URL: Record<string, string> = Object.fromEntries(Object.entries(MARK_FILES).map(([path, url]) => [path.split('/').pop()!.replace('.png', ''), url]));

export const LOGO_MARKS = ['rocket', 'leaf', 'bolt', 'heart', 'cloud', 'chat', 'cart', 'book', 'paw', 'gem', 'globe', 'music'].filter((m) => MARK_URL[m]);
export const LOGO_COLORS = ['#2d8fd5', '#36b44a', '#f0a020', '#d9453b', '#8b63e8', '#11a3a6', '#e8604c', '#2c2f45'];

export function defaultLogo(): ServiceInfo['logo'] {
  return { mark: LOGO_MARKS[0] ?? '', color: LOGO_COLORS[0] };
}

// 서비스가 없으면(예전 저장) 회사 이름 첫 글자를 씁니다.
export function ServiceLogo({ service, fallback, size = 34 }: { service?: ServiceInfo; fallback: string; size?: number }) {
  if (!service) return <div className="cc-logo" style={{ width: size, height: size }}>{[...fallback][0]}</div>;
  const url = MARK_URL[service.logo.mark];
  return (
    <div className="svc-logo" style={{ width: size, height: size, background: service.logo.color, borderRadius: size * 0.22, fontSize: size * 0.5 }}>
      {url ? <img src={url} alt="" draggable={false} /> : [...service.name][0]}
    </div>
  );
}
