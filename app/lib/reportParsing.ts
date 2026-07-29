export function isInterestRelated(...values: unknown[]): boolean {
  const haystack = values
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLowerCase();

  return /(?:^|\s)(bank\s+interest|interest\s*(earned|received|income|payable|charge|credit|debit)?|credit\s+interest|deposit\s+interest|savings\s+interest|int(?:\.|erest)?)(?:$|\s)/i.test(haystack);
}
