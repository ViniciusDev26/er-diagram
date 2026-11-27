const matcher = (patterns: string[]) => {
  const regexes = patterns.map((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`);
  });
  return (name: string, qualified: string) =>
    regexes.some((regex) => regex.test(name) || regex.test(qualified));
};

/**
 * Whether a table is drawn: it matches an include pattern (when there is any) and no exclude
 * pattern. A pattern matches the name or the qualified name; `*` matches any run of characters.
 */
export function tableFilter(
  include: string[] = [],
  exclude: string[] = [],
): (name: string, qualified: string) => boolean {
  const included = matcher(include);
  const excluded = matcher(exclude);
  return (name, qualified) =>
    (include.length === 0 || included(name, qualified)) && !excluded(name, qualified);
}
