// DT-08 설정·종료: 음량, 효과, 알림, 긴급 자동 일시정지, 기본 배속, 전체 화면, 단축키 안내, 저장 후 종료
import { useState } from 'react';
import { setMuted, setVolume, soundSettings, play } from '../sound';
import { setSettings, useSettings } from '../meta';
import { saveNow } from '../autosave';
import { toggleFullscreen, isElectron } from '../../platform/save';
import './apps.css';

export function SettingsApp() {
  const st = useSettings();
  const [snd, setSnd] = useState(soundSettings());
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="col" style={{ maxWidth: 640 }}>
      <div className="section-title">소리</div>
      <div className="row">
        <span style={{ width: 120 }}>효과음 음량</span>
        <input
          type="range"
          className="grow"
          data-testid="volume"
          min={0}
          max={1}
          step={0.05}
          value={snd.volume}
          onChange={(e) => {
            setVolume(Number(e.target.value));
            setSnd(soundSettings());
            play('click');
          }}
        />
        <span className="num" style={{ width: 40 }}>
          {Math.round(snd.volume * 100)}
        </span>
        <label className="row tiny">
          <input
            type="checkbox"
            checked={snd.muted}
            onChange={(e) => {
              setMuted(e.target.checked);
              setSnd(soundSettings());
            }}
          />
          음소거
        </label>
      </div>
      <div className="section-title">게임</div>
      <label className="row">
        <input type="checkbox" checked={st.autoPauseUrgent} onChange={(e) => setSettings({ autoPauseUrgent: e.target.checked })} />
        긴급 알림(장애·인수 제안·투자 제안서 등)이 오면 시간을 자동으로 멈춤(DT-04). 꺼도 파산 경고는 멈춥니다.
      </label>
      <label className="row">
        <input type="checkbox" checked={st.toasts} onChange={(e) => setSettings({ toasts: e.target.checked })} />
        오른쪽 아래 알림 토스트 보이기
      </label>
      <label className="row">
        <input type="checkbox" checked={st.animations} onChange={(e) => setSettings({ animations: e.target.checked })} />
        축하 연출·떠오르는 숫자 보이기
      </label>
      <div className="row">
        <span style={{ width: 160 }}>스페이스로 다시 시작할 배속</span>
        <div className="seg">
          {[1, 2, 4].map((v) => (
            <button key={v} className={st.defaultSpeed === v ? 'on' : ''} onClick={() => setSettings({ defaultSpeed: v })}>
              {v}배속
            </button>
          ))}
        </div>
      </div>
      <div className="section-title">화면</div>
      <div className="row">
        <button className="btn ghost" onClick={toggleFullscreen}>
          전체 화면 켜기/끄기
        </button>
      </div>
      <div className="section-title">단축키</div>
      <table className="t">
        <tbody>
          <tr>
            <td>스페이스</td>
            <td>일시정지 / 계속</td>
          </tr>
          <tr>
            <td>1 · 2 · 3</td>
            <td>1배속 · 2배속 · 4배속</td>
          </tr>
          <tr>
            <td>Tab</td>
            <td>대표 컴퓨터 열기 / 닫기</td>
          </tr>
          <tr>
            <td>Esc</td>
            <td>앱 → 바탕화면 → 사무실</td>
          </tr>
          <tr>
            <td>방향키 · 끌기 · 휠</td>
            <td>사무실 카메라 이동 · 확대</td>
          </tr>
        </tbody>
      </table>
      <div className="section-title">시스템 종료</div>
      <div className="row">
        <button
          className="btn red"
          data-testid="quit"
          onClick={async () => {
            const ok = await saveNow('종료');
            setMsg(ok ? '저장했습니다.' : '저장하지 못했습니다.');
            if (ok && isElectron()) window.pcSave?.quit?.();
          }}
        >
          저장하고 {isElectron() ? '종료' : '저장만'}
        </button>
        {msg && <span className="tiny">{msg}</span>}
      </div>
    </div>
  );
}
