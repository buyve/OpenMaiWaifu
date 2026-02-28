import { useCallback } from "react";
import type { CommentFrequency } from "../Settings.tsx";

// ---------- Constants ----------

/** Display labels for comment frequency slider. Actual daily limits are
 *  defined in App.tsx COMMENT_FREQ_LIMIT (off=0, low=1, medium=3, high=10). */
const COMMENT_FREQ_LABELS: Record<CommentFrequency, string> = {
  off: "Off",
  low: "Low",
  medium: "Medium",
  high: "High",
};

const COMMENT_FREQ_VALUES: CommentFrequency[] = ["off", "low", "medium", "high"];

// ---------- Types ----------

export interface BehaviorSettingsProps {
  commentFrequency: CommentFrequency;
  onCommentFrequencyChange: (freq: CommentFrequency) => void;
}

// ---------- Component ----------

export default function BehaviorSettings({
  commentFrequency,
  onCommentFrequencyChange,
}: BehaviorSettingsProps) {
  const freqIndex = COMMENT_FREQ_VALUES.indexOf(commentFrequency);

  const handleFrequencySlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      onCommentFrequencyChange(COMMENT_FREQ_VALUES[idx]);
    },
    [onCommentFrequencyChange],
  );

  return (
    <div className="settings-card">
      <div className="settings-card-title">Behavior</div>

      <div className="settings-row">
        <div className="settings-row-label">
          Comment Frequency
        </div>
        <div className="settings-slider-container">
          <input
            type="range"
            className="settings-slider"
            min={0}
            max={3}
            step={1}
            value={freqIndex}
            onChange={handleFrequencySlider}
          />
          <span className="settings-slider-label">
            {COMMENT_FREQ_LABELS[commentFrequency]}
          </span>
        </div>
      </div>
    </div>
  );
}
