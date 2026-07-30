export function isInterestRelated(...values: unknown[]): boolean {
  const haystack = values
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();

  // Normalize punctuation noise from PDF/OCR text so word matching is reliable.
  const normalized = haystack.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

  return /\b(?:bank\s+interest|interest|interst|intersst|intrest|credit\s+interest|deposit\s+interest|savings\s+interest|interest\s+(?:earned|received|income|payable|charge|credit|debit)|int)\b/i.test(
    normalized
  );
}
