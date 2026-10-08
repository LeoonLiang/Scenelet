import { LockKeyhole } from 'lucide-react';
import type { Settings } from '../types';
import { t } from '../i18n';

type Props = {
  platform: string; settings: Settings; warning?: string; busy: boolean;
  onChange: (patch: Partial<Settings>) => void; onSettings: () => void;
};

export default function LockScreenNotice({ platform, settings, warning, busy, onChange, onSettings }: Props) {
  if (platform !== 'win32' || (!settings.lockScreenPrompt && !warning)) return null;
  return <section className="lock-screen-notice" aria-label={t(warning ? 'lockScreen.warningTitle' : 'lockScreen.promptTitle')}>
    <div className="lock-screen-notice-body">
      <LockKeyhole size={18} aria-hidden="true"/>
      <div>
        <strong role={warning ? 'status' : undefined}>{t(warning ? 'lockScreen.warningTitle' : 'lockScreen.promptTitle')}</strong>
        <p>{t(warning ? 'lockScreen.warningText' : 'lockScreen.promptText')}</p>
        {warning && <details><summary>{t('lockScreen.details')}</summary><pre>{warning}</pre></details>}
      </div>
    </div>
    <div className="lock-screen-notice-actions">
      {warning ? <button className="button secondary" onClick={onSettings}>{t('lockScreen.settings')}</button> : <>
        <button className="button primary" disabled={busy} onClick={() => onChange({ syncLockScreen: true, lockScreenPrompt: false })}>{t('lockScreen.enable')}</button>
        <button className="text-button" disabled={busy} onClick={() => onChange({ syncLockScreen: false, lockScreenPrompt: false })}>{t('lockScreen.keepOff')}</button>
      </>}
    </div>
  </section>;
}
