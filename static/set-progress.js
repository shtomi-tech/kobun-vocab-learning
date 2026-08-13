"use strict";

const KobunSetProgress = (() => {
  const LABELS = {
    untouched: "未着手",
    "in-progress": "学習中",
    review: "要復習",
    "final-pending": "最終チェック待ち",
    cleared: "CLEAR ✓",
  };

  function summarize(set, progress = {}) {
    const words = Array.isArray(set?.words) ? set.words : [];
    const total = words.length;
    const units = (progress && typeof progress === "object" && progress.units) || {};
    const finalCheck = (progress && typeof progress === "object" && progress.finalCheck) || {};
    const bestScore = Number.isFinite(finalCheck.bestScore) ? finalCheck.bestScore : 0;
    const hasResume = Boolean(progress && typeof progress === "object" && progress.resume);

    let learnedCount = 0;
    let reviewCount = 0;
    for (const word of words) {
      const unit = units[word.id];
      if (!unit) continue;
      if (unit.learned) learnedCount++;
      if (unit.needsReview) reviewCount++;
    }

    let key;
    if (finalCheck.cleared === true) key = "cleared";
    else if (reviewCount > 0) key = "review";
    else if (hasResume || (learnedCount > 0 && learnedCount < total)) key = "in-progress";
    else if (total > 0 && learnedCount === total) key = "final-pending";
    else key = "untouched";

    let detail;
    if (key === "untouched") detail = "まだ学習していません";
    else if (key === "in-progress") detail = hasResume ? "続きあり" : `残り${total - learnedCount}語`;
    else if (key === "review") detail = `要復習 ${reviewCount}語`;
    else if (key === "final-pending") detail = finalCheck.lastTriedAt ? `BEST ${bestScore} / ${total}` : "最終チェック未CLEAR";
    else detail = `BEST ${bestScore} / ${total}`;

    return {
      key,
      label: LABELS[key],
      total,
      learnedCount,
      reviewCount,
      bestScore,
      hasResume,
      detail,
    };
  }

  return { summarize };
})();

if (typeof module !== "undefined") module.exports = KobunSetProgress;
