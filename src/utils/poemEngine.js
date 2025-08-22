export function renderPoemTemplate(rawText, userName, friendNames) {
  let output = rawText.replaceAll("{{userName}}", userName || "यार");
  for (let i = 0; i < 10; i += 1) {
    const token = `{{friendName${i + 1}}}`;
    output = output.replaceAll(token, friendNames?.[i] || `दोस्त${i + 1}`);
  }
  return output;
}
export function extractPlaceholders(rawText) {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const tokens = new Set();
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = re.exec(rawText)) !== null) {
    tokens.add(match[1]);
  }
  return Array.from(tokens);
}

export function analyzeTemplate(rawText) {
  const tokens = extractPlaceholders(rawText);
  const allowed = new Set(["userName", ...Array.from({ length: 10 }, (_v, i) => `friendName${i + 1}`)]);
  const unknownTokens = tokens.filter((t) => !allowed.has(t));
  let maxFriendIndexRequired = 0;
  tokens.forEach((t) => {
    const m = /^friendName(\d+)$/.exec(t);
    if (m) {
      const idx = parseInt(m[1], 10);
      if (idx > maxFriendIndexRequired) maxFriendIndexRequired = idx;
    }
  });
  return { tokens, unknownTokens, maxFriendIndexRequired };
}

export function validateTemplateOrThrow(rawText) {
  const analysis = analyzeTemplate(rawText);
  if (analysis.unknownTokens.length > 0) {
    const list = analysis.unknownTokens.join(", ");
    const err = new Error(`Unknown placeholders: ${list}`);
    err.status = 400;
    throw err;
  }
  if (analysis.maxFriendIndexRequired > 10) {
    const err = new Error("Supports up to {{friendName1}}..{{friendName10}} only");
    err.status = 400;
    throw err;
  }
  return analysis;
}

