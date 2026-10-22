// 상점 창 → 사무실 화면 배치 모드 요청(A-87). 상점에서 "사서 놓기"·"옮기기"·"치우기"를 누르면
// 창을 닫고 사무실 화면(Office)이 이 요청을 받아 배치 모드로 들어갑니다.
import { useEffect } from 'react';

export interface EditRequest {
  mode: 'place' | 'move' | 'remove' | 'rotate';
  item?: string; // place: 'desk' 또는 가구 id
}

const listeners = new Set<(r: EditRequest) => void>();

export function requestEdit(r: EditRequest) {
  for (const l of listeners) l(r);
}

export function useEditRequests(onRequest: (r: EditRequest) => void) {
  useEffect(() => {
    listeners.add(onRequest);
    return () => {
      listeners.delete(onRequest);
    };
  });
}
