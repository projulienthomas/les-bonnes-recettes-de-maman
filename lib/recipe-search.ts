export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Every word of the query must appear in the text, either as written or with
 * a typo: one edit for words of 4+ letters, two for 8+. Both arguments are
 * expected to be normalized with `normalizeSearchText`.
 */
export function matchesSearchQuery(text: string, query: string) {
  const queryWords = splitWords(query);
  if (queryWords.length === 0) return true;
  const textWords = splitWords(text);

  return queryWords.every(
    (queryWord) =>
      text.includes(queryWord) ||
      textWords.some((textWord) => matchesWithTypo(textWord, queryWord)),
  );
}

function splitWords(value: string) {
  return value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function matchesWithTypo(textWord: string, queryWord: string) {
  const allowedEdits = queryWord.length >= 8 ? 2 : queryWord.length >= 4 ? 1 : 0;
  if (allowedEdits === 0) return false;

  // The query may still be being typed, so compare it with the start of the word.
  for (let delta = -allowedEdits; delta <= allowedEdits; delta += 1) {
    const length = queryWord.length + delta;
    if (length > textWord.length) break;
    if (editDistance(textWord.slice(0, length), queryWord) <= allowedEdits) {
      return true;
    }
  }
  return false;
}

// Optimal string alignment: insertions, deletions, substitutions and swaps of
// two adjacent letters each cost one edit.
function editDistance(a: string, b: string) {
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], beforePrevious[j - 2] + 1);
      }
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[b.length];
}
