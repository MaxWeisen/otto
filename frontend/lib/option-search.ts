/**
 * Returns the options matching the query: names that start with it first,
 * then names with a later word that starts with it.
 */
export function filterOptions(
  options: readonly string[],
  query: string,
): readonly string[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return options;
  }

  const startsWithQuery = (text: string) => text.startsWith(normalizedQuery);
  const names = options.map((option) => [option, option.toLowerCase()]);
  const prefixMatches = names.filter(([, name]) => startsWithQuery(name));
  const wordMatches = names.filter(
    ([, name]) =>
      !startsWithQuery(name) && name.split(/[\s-]+/).some(startsWithQuery),
  );

  return [...prefixMatches, ...wordMatches].map(([option]) => option);
}
