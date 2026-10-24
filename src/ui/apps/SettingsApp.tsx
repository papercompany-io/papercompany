// DT-08 설정·종료: 음량, 효과, 알림, 긴급 자동 일시정지, 기본 배속, 전체 화면, 단축키 안내, 저장 후 종료
// 화면 짜임(A-106): 회색 판 묶음마다 "이름 왼쪽 · 조작 오른쪽" 줄. 켜고 끄는 건 스위치
// 화면(A-179): 업무·커리어와 같은 톤 — 가운데 제목 + 설정 앱 타일, 묶음은 1px 테두리 납작한 카드, 묶음 이름·키는 픽셀 글꼴, 고르기는 알약. 긴 안내는 title로
import { useState } from 'react';
import { setMuted, setMusicVolume, setVolume, soundSettings, play } from '../sound';
import { setAutoSkip, setSettings, useSettings } from '../meta';
import { saveNow } from '../autosave';
import { toggleFullscreen, isElectron } from '../../platform/save';
import { APP_COLORS, AppIcon } from '../icons';
import { replayTutorial } from '../Tutorial';
import './apps.css';
import './skin/SettingsApp.css';

// 화면 크기 고르기(A-241) [예시값]: 창 최소 크기 1100×700에서 가장 크게 골라도 화면이 넘치지 않을 만큼
const UI_SCALES: [number, string][] = [
  [0.9, '작게'],
  [1, '보통'],
  [1.15, '크게'],
  [1.3, '아주 크게'],
];

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`set-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

function Row({ title, sub, tip, children }: { title: string; sub?: string; tip?: string; children: React.ReactNode }) {
  return (
    <div className="set-row" title={tip}>
      <div className="set-text">
        <b>{title}</b>
        {sub && <span>{sub}</span>}
      </div>
      <div className="set-ctrl">{children}</div>
    </div>
  );
}

export function SettingsApp() {
  const st = useSettings();
  const [snd, setSnd] = useState(soundSettings());
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="col set se2">
      <div className="se2-head">
        <span className="se2-tile" style={{ ['--tc' as string]: APP_COLORS.settings }}>
          <AppIcon id="settings" />
        </span>
        <h2 className="se2-big">설정</h2>
      </div>
      <section className="set-group">
        <div className="hf-title">소리</div>
        <Row title="효과음 음량">
          <input
            type="range"
            data-testid="volume"
            min={0}
            max={1}
            step={0.05}
            value={snd.volume}
            disabled={snd.muted}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              setSnd(soundSettings());
              play('click');
            }}
          />
          <span className="set-num">{Math.round(snd.volume * 100)}</span>
        </Row>
        {/* 배경음악(A-246): 효과음과 따로 조절, 기본은 작게 */}
        <Row title="배경음악 음량">
          <input
            type="range"
            data-testid="music-volume"
            min={0}
            max={1}
            step={0.05}
            value={snd.musicVolume}
            disabled={snd.muted}
            onChange={(e) => {
              setMusicVolume(Number(e.target.value));
              setSnd(soundSettings());
            }}
          />
          <span className="set-num">{Math.round(snd.musicVolume * 100)}</span>
        </Row>
        <Row title="음소거" sub="효과음과 배경음악을 함께 끕니다.">
          <Switch
            label="음소거"
            on={snd.muted}
            onChange={(v) => {
              setMuted(v);
              setSnd(soundSettings());
            }}
          />
        </Row>
      </section>

      <section className="set-group">
        <div className="hf-title">게임</div>
        <Row title="긴급 시 자동 멈춤" sub="장애·인수 제안·투자 제안서가 오면 시간을 멈춥니다. 꺼도 파산 경고는 멈춥니다.">
          <Switch label="긴급 시 자동 멈춤" on={st.autoPauseUrgent} onChange={(v) => setSettings({ autoPauseUrgent: v })} />
        </Row>
        <Row title="알림 카드 보이기" sub="오른쪽 아래에 새 소식을 띄웁니다.">
          <Switch label="알림 카드 보이기" on={st.toasts} onChange={(v) => setSettings({ toasts: v })} />
        </Row>
        <Row title="축하 연출 보이기" sub="종이 꽃가루와 떠오르는 숫자를 띄웁니다.">
          <Switch label="축하 연출 보이기" on={st.animations} onChange={(v) => setSettings({ animations: v })} />
        </Row>
        <Row title="퇴근 뒤 밤 빨리 감기" sub="켜 두면 18시부터 다음 날 9시까지 밤을 빠르게 흘려 보냅니다." tip="18시가 지나면 시계는 다음 날 9시까지 흐릅니다. 켜 두면 밤을 빠르게 흘려 보냅니다. 밤에는 위 막대의 빨리 감기 버튼으로도 켜고 끌 수 있습니다.">
          <div className="seg" data-testid="auto-skip-night">
            {(
              [
                ['off', '끄기'],
                ['quiet', '야근이 끝나면'],
                ['always', '바로'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} className={st.autoSkipNight === v ? 'on' : ''} onClick={() => setAutoSkip(v)}>
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row title="Space로 재개할 배속">
          <div className="seg">
            {[1, 2, 4].map((v) => (
              <button key={v} className={st.defaultSpeed === v ? 'on' : ''} onClick={() => setSettings({ defaultSpeed: v })}>
                {v}배속
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="set-group">
        <div className="hf-title">화면</div>
        {/* 화면 크기(A-241): 화면 전체 확대 배율 */}
        <Row title="화면 크기" sub="글자와 창을 함께 키우거나 줄입니다.">
          <div className="seg" data-testid="ui-scale">
            {UI_SCALES.map(([v, label]) => (
              <button key={v} className={st.uiScale === v ? 'on' : ''} onClick={() => setSettings({ uiScale: v })}>
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row title="전체 화면">
          <button className="btn small ghost" onClick={toggleFullscreen}>
            켜기 / 끄기
          </button>
        </Row>
        {/* A-244: 게임 시작 튜토리얼 다시 보기 */}
        <Row title="기능 안내 보이기" sub="기능을 쓸 때가 되면 그 버튼을 빛나게 짚고 짧게 설명합니다.">
          <Switch label="기능 안내 보이기" on={st.guides} onChange={(v) => setSettings({ guides: v })} />
        </Row>
        <Row title="튜토리얼" sub="화면 소개와 기능 안내를 처음부터 다시 봅니다.">
          <button className="btn small ghost" data-testid="tutorial-replay" onClick={replayTutorial}>
            다시 보기
          </button>
        </Row>
      </section>

      <section className="set-group">
        <div className="hf-title">단축키</div>
        {(
          [
            [['Space'], '멈춤 / 계속'],
            [['1', '2', '3'], '1배속 · 2배속 · 4배속'],
            [['Esc'], '열린 창 닫기'],
            [['방향키'], '사무실 둘러보기 (끌기로 이동·휠로 확대)'],
          ] as [string[], string][]
        ).map(([keys, what]) => (
          <div key={what} className="set-row">
            <div className="set-keys">
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </div>
            <span className="set-what">{what}</span>
          </div>
        ))}
      </section>

      <section className="set-group">
        <Row title={isElectron() ? '저장하고 끝내기' : '지금 저장하기'} sub={msg ?? '게임은 자동으로도 저장됩니다.'}>
          <button
            className={`btn ${isElectron() ? 'red' : ''}`}
            data-testid="quit"
            onClick={async () => {
              const ok = await saveNow('종료');
              setMsg(ok ? '저장했습니다.' : '저장하지 못했습니다.');
              if (ok && isElectron()) window.pcSave?.quit?.();
            }}
          >
            {isElectron() ? '저장하고 종료' : '저장'}
          </button>
        </Row>
      </section>
    </div>
  );
}
