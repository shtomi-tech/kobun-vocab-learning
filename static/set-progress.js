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

  function aggregate(sources = []) {
    const totalSets = sources.length;
    let clearedSets = 0;
    let inProgressSets = 0;
    let reviewSets = 0;
    for (const source of sources) {
      const summary = summarize(source?.set, source?.progress);
      if (summary.key === "cleared") clearedSets++;
      else if (summary.key === "review") reviewSets++;
      else if (summary.key === "in-progress") inProgressSets++;
    }
    return { totalSets, clearedSets, inProgressSets, reviewSets };
  }

  const BLOCK_LABELS = {
    unlearned: "未学習",
    current: "学習中・現在のブロック",
    "meaning-checked": "暗記・意味確認済み",
  };

  function summarizeBlocks(set, progress = {}, batchSize = 4) {
    const words = Array.isArray(set?.words) ? set.words : [];
    const units = (progress && typeof progress === "object" && progress.units) || {};
    const resumeRaw = (progress && typeof progress === "object") ? progress.resume : null;
    const blockCount = Math.ceil(words.length / batchSize);
    const resume = resumeRaw && resumeRaw.mode === "learn" &&
      Number.isInteger(resumeRaw.batchIndex) && resumeRaw.batchIndex >= 0 && resumeRaw.batchIndex < blockCount
      ? resumeRaw
      : null;

    const blocks = [];
    for (let index = 0; index < blockCount; index++) {
      const blockWords = words.slice(index * batchSize, index * batchSize + batchSize);
      const total = blockWords.length;
      let learnedCount = 0;
      let correctCount = 0;
      let reviewCount = 0;
      for (const word of blockWords) {
        const u = units[word.id];
        if (!u) continue;
        if (u.learned) learnedCount++;
        if (u.solvedCorrect) correctCount++;
        if (u.needsReview) reviewCount++;
      }

      const isCurrent = Boolean(resume && resume.batchIndex === index && ["flash", "meaning", "wrongReview"].includes(resume.stage));
      const isPastMeaning = Boolean(resume && (resume.batchIndex > index ||
        (resume.batchIndex === index && ["wrongReview", "context"].includes(resume.stage))));

      let key;
      let label;
      if (reviewCount > 0) { key = "review"; label = `要復習 ${reviewCount}語`; }
      else if (total > 0 && correctCount === total) { key = "done"; label = "✓ 正解確認済み"; }
      else if (isCurrent) { key = "current"; label = BLOCK_LABELS.current; }
      else if (isPastMeaning) { key = "meaning-checked"; label = BLOCK_LABELS["meaning-checked"]; }
      else if (total > 0 && learnedCount === total) { key = "answered"; label = `文中回答済み ${learnedCount}/${total}語`; }
      else { key = "unlearned"; label = BLOCK_LABELS.unlearned; }

      blocks.push({
        index,
        words: blockWords,
        total,
        learnedCount,
        correctCount,
        reviewCount,
        key,
        label,
        isCurrent,
      });
    }
    return blocks;
  }

  return { summarize, aggregate, summarizeBlocks };
})();

if (typeof module !== "undefined") module.exports = KobunSetProgress;
