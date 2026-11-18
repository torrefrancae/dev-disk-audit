export function compileNamePatterns(patterns: string[]): (name: string) => boolean {
  const rules = patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0)
    .map((pattern) => {
      const source = `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`;
      return new RegExp(source);
    });
  return (name) => rules.some((rule) => rule.test(name));
}
