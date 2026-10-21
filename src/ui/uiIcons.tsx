// 인터페이스 아이콘(A-85): 단색 선 아이콘(lucide). 픽셀 그림은 사무실(게임 세계) 안에서만 씁니다.
import { Building2, CalendarClock, Bot, Briefcase, CandlestickChart, DoorOpen, Landmark, LineChart, MessagesSquare, Newspaper, Package, Settings, Trophy, UserPlus, Users, type LucideIcon } from 'lucide-react';

export const APP_ICON: Record<string, LucideIcon> = {
  schedule: CalendarClock,
  messenger: MessagesSquare,
  product: Package,
  market: LineChart,
  hiring: UserPlus,
  employees: Users,
  ai: Bot,
  office: Building2,
  invest: Landmark,
  finance: Briefcase,
  exit: DoorOpen,
  stock: CandlestickChart,
  news: Newspaper,
  career: Trophy,
  settings: Settings,
};

export function UiIcon({ id, size = 18 }: { id: string; size?: number }) {
  const I = APP_ICON[id] ?? Package;
  return <I size={size} strokeWidth={1.75} />;
}
