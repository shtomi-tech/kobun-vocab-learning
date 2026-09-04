"use strict";

// 四択の誤答が正解と同義にならないための判定をまとめる。
// アプリ（static/mode-vocab.js）と検査スクリプト（scripts/check-*.mjs）が
// 同じ実装を参照するための唯一の正本。ここを直せば両方に反映される。
const KobunMeaningGuard = (() => {
  // 意味文の表記ゆれを落とす。記号・囲み数字・「〜」の省略記号は同義判定の邪魔になる。
  const normalizeMeaning = (value) => value.replace(/[「」『』【】（）()、。・／〜～⇔①②③④⑤\s]/g, "");
  const meaningParts = (value) => value.split(/[。／]/).map(normalizeMeaning).filter(Boolean);
  const meaningText = (word) => word.meanings.join("／");

  // 字面は違うが学習上は同義に見える語群。1問の選択肢に2つ以上出さない。
  const meaningFamilies = [
    // 死の周辺語を一つにまとめると、第4セットの文中四択が枯れる。
    // 「死ぬ」「先立たれる」「死別」「命」は視点が異なるため分ける。
    /死ぬ|亡くなる|いなくなる/,
    /先立たれる/,
    /死別/,
    /命/,
    /男女|夫婦|交際|結婚|求婚|言い寄|出会|対面|愛情|恋人|男女の縁|親しく言葉/,
    /泣|涙|悲し/,
    /出家|仏道修行|隠遁/,
    /歩く|徒歩|去る|行く|渡る|通る|移動|出歩く|遠ざかる|進む/,
    /連れる|伴う|連れ立つ|備える|持っていく/,
    /じっとしている|座る|ひざまずく|腰をおろす|居ずまい/,
    /書物|漢籍|漢詩|学問|漢学|学才|学識|芸能|技能/,
    /天皇|上皇|法皇|中宮|東宮|皇族|行幸|御幸|行啓|ご機嫌/,
    /前世|宿命|運命|約束|縁|契り|愛の誓い/,
    /茫然|前後不覚|正気を失|どうしてよいかわから|道理をわきまえない/,
    // 程度表現も一つにまとめず、「もちろん」「ありきたり」と
    // 「言葉では足りない／表現できない」を別の意味群として扱う。
    /言うまでもない|もちろん/,
    /不十分|言い尽くせない|表現できない|なんとも/,
    /ありきたり/,
    /異様|奇怪|度を超えてよくない|異常|普通ではない|普段とは異な|並々ではない/,
    /有名|評判|名声|名前/,
    /たいした|これといった|それほど|まったく|少しも|決して|けっして|滅多に|ほとんど/,
    /まさか|よもや/,
    /するな|してはいけない/,
    /いらっしゃる|おいでになる|おありになる|ていらっしゃる|でいらっしゃる/,
    /お与えになる|くださる|下賜/,
    /申しあげる/,
    /なさる|お〜になる|お召しになる|お乗りになる/,
    /なぜ|どうして|どのように|どんなに|どうにかして|何とかして/,
    /そのように|このように|あのように|そうである|こう$|そう$/,
    // 病気で苦しむ系は動詞・形容詞で語形が違うだけで、文中四択では見分けがつかない。
    /病気/,
    // 「やつす」（他動詞）と「やつる」（自動詞）は語義が同一で、空欄からは決められない。
    /目立たない格好|粗末な服装/,
    // 寂しさ・興ざめ・荒涼は、同じ場面の描写に等しく収まってしまう。
    /寂し|荒涼|興ざめ|ぞっと/,
    // 「かたはらいたし」と「はしたなし」は、体裁の悪さという同じ場面で入れ替えが利く。
    /みっともない|体裁が悪い|いたたまれない|恥ずかしい/,
  ];

  const hasMeaningOverlap = (word, other) => word.meanings.some((meaning) =>
    other.meanings.some((candidate) => meaningParts(meaning).some((left) =>
      meaningParts(candidate).some((right) =>
        left === right || (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left)))
      )
    ))
  );

  const hasMeaningFamilyOverlap = (word, other) => meaningFamilies.some((family) =>
    word.meanings.some((meaning) => family.test(meaning)) &&
    other.meanings.some((meaning) => family.test(meaning))
  );

  const isSafePair = (word, other) => !hasMeaningOverlap(word, other) && !hasMeaningFamilyOverlap(word, other);

  // choiceSet() は誤答を1つずつ足しながら、既に選んだ誤答とも安全かを見る。
  // つまり「正解に対して安全」だけでは足りず、誤答どうしも安全な3つ組が要る。
  function hasThreeMutuallySafe(target, pool) {
    const candidates = pool.filter((other) => other.id !== target.id && isSafePair(target, other));
    for (let first = 0; first < candidates.length; first += 1) {
      for (let second = first + 1; second < candidates.length; second += 1) {
        if (!isSafePair(candidates[first], candidates[second])) continue;
        for (let third = second + 1; third < candidates.length; third += 1) {
          if (isSafePair(candidates[first], candidates[third]) && isSafePair(candidates[second], candidates[third])) {
            return { ok: true, candidateCount: candidates.length };
          }
        }
      }
    }
    return { ok: false, candidateCount: candidates.length };
  }

  return {
    meaningText,
    normalizeMeaning,
    meaningParts,
    meaningFamilies,
    hasMeaningOverlap,
    hasMeaningFamilyOverlap,
    isSafePair,
    hasThreeMutuallySafe,
  };
})();

if (typeof module !== "undefined") module.exports = KobunMeaningGuard;
