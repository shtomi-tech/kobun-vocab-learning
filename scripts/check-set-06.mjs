import assert from "node:assert/strict";
import { checkSet, allPairs } from "./lib/set-check.mjs";

checkSet({
  setId: "kobun-set-06",
  firstNumber: 61,
  expect(wordsById) {
    const word69 = wordsById.get("kv06-069");
    assert.equal(word69.example, "かの女君ゆめのごとありしに、ただならずなりにけり。");
    assert.equal(word69.translation, "その女君は、夢のような一夜を過ごしたところ、妊娠した。");
    assert.equal(word69.cloze, "かの女君ゆめのごとありしに、（　）なりにけり。");
    assert.equal(word69.source, "宇津保物語");
  },
  familyOverlapPairs: [
    ...allPairs(["kv06-063", "kv06-064", "kv06-068", "kv06-069"]),
    ["kv06-066", "kv06-067"],
    ["kv06-071", "kv06-072"],
  ],
  summary: "OK: set-06 data, notes, and meaning-family guards",
});
