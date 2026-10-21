import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <div style={{ color: '#fff', fontFamily: 'sans-serif', padding: 40 }}>페이퍼컴퍼니 부팅 준비 중</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
