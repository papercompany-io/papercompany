// 흰 픽셀 표식(A-166, A-171): 색 타일 위에 올리는 체크·깃발. 커리어 미션 길과 업무 창 MVP 길이 같이 씁니다.
// 달성 표시: 2칸 굵기 흰 픽셀 체크(9×7 칸)
export function PixelCheck() {
  const cells = [[1, 3], [2, 4], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1]];
  return (
    <svg width="18" height="14" viewBox="0 0 9 7" shapeRendering="crispEdges" aria-hidden>
      {cells.flatMap(([x, y]) => [<rect key={`a${x}`} x={x} y={y - 1} width={1} height={1} fill="#fff" />, <rect key={`b${x}`} x={x} y={y} width={1} height={1} fill="#fff" />])}
    </svg>
  );
}

// 지금 미션 표시: 흰 픽셀 깃발(7×9 칸)
export function PixelFlag() {
  const rows = ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....', '#......', '#......'];
  return (
    <svg width="14" height="18" viewBox="0 0 7 9" shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill="#fff" /> : null)))}
    </svg>
  );
}
