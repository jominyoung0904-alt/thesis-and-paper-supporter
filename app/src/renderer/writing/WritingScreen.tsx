/**
 * Writing-screen container (T59, SPEC-TSA-002, FR-WRT-009/010/011).
 *
 * Groups every writing-support screen behind one set of inner tabs — "✅ 서론
 * 점검" (existing FR-WRT-001/002 quality gate), "✨ 문장 다듬기" (FR-WRT-010),
 * "🧑‍⚖️ 모의 심사" (FR-WRT-011), and "📜 점검 기록" (existing FR-WRT-008 gate
 * history) — instead of each living as a separate top-level `App.tsx` tab.
 * Every sub-screen keeps owning its own IPC calls; this container only owns
 * which one is currently mounted and fans out one bundled callbacks object.
 *
 * `WritingCheckScreen` and `GateHistoryScreen` are unchanged — reused exactly
 * as they were before this task (see the completion report's "배선 명세" for
 * the `App.tsx` mount-point swap this container requires, owned by T62).
 */
import { useState } from 'react';

import type { GateHistoryScreenCallbacks } from './GateHistoryScreen';
import { GateHistoryScreen } from './GateHistoryScreen';
import type { MockReviewViewCallbacks } from './MockReviewView';
import { MockReviewView } from './MockReviewView';
import type { PolishViewCallbacks } from './PolishView';
import { PolishView } from './PolishView';
import type { WritingCheckCallbacks } from './WritingCheckScreen';
import { WritingCheckScreen } from './WritingCheckScreen';
import './writingScreen.css';

export interface WritingScreenCallbacks {
  check: WritingCheckCallbacks;
  polish: PolishViewCallbacks;
  mockReview: MockReviewViewCallbacks;
  history: GateHistoryScreenCallbacks;
}

export interface WritingScreenProps {
  callbacks: WritingScreenCallbacks;
}

type WritingSubTab = 'check' | 'polish' | 'mock-review' | 'history';

export function WritingScreen({ callbacks }: WritingScreenProps): JSX.Element {
  const [subTab, setSubTab] = useState<WritingSubTab>('check');

  return (
    <div className="writing-screen">
      <div className="writing-subtabs" role="tablist" aria-label="글쓰기 화면 전환">
        <SubTabButton current={subTab} tab="check" label="✅ 서론 점검" onSelect={setSubTab} />
        <SubTabButton current={subTab} tab="polish" label="✨ 문장 다듬기" onSelect={setSubTab} />
        <SubTabButton current={subTab} tab="mock-review" label="🧑‍⚖️ 모의 심사" onSelect={setSubTab} />
        <SubTabButton current={subTab} tab="history" label="📜 점검 기록" onSelect={setSubTab} />
      </div>

      {subTab === 'check' && <WritingCheckScreen callbacks={callbacks.check} />}
      {subTab === 'polish' && <PolishView callbacks={callbacks.polish} />}
      {subTab === 'mock-review' && <MockReviewView callbacks={callbacks.mockReview} />}
      {subTab === 'history' && <GateHistoryScreen callbacks={callbacks.history} />}
    </div>
  );
}

interface SubTabButtonProps {
  current: WritingSubTab;
  tab: WritingSubTab;
  label: string;
  onSelect: (tab: WritingSubTab) => void;
}

function SubTabButton({ current, tab, label, onSelect }: SubTabButtonProps): JSX.Element {
  const active = current === tab;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`writing-subtab-btn${active ? ' writing-subtab-btn-active' : ''}`}
      onClick={() => onSelect(tab)}
    >
      {label}
    </button>
  );
}
