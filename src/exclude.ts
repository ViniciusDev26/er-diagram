/** Whether a table is left out: a pattern matches its name or its qualified name. */
export function excluder(patterns: string[] = []): (name: string, qualified: string) => boolean {
  const regexes = patterns.map((pattern) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`);
  });
  return (name, qualified) => regexes.some((regex) => regex.test(name) || regex.test(qualified));
}
