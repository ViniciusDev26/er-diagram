export function writeArrayToSqlArray(arr: string[]): string {
  return `(${arr.map(item => `"${item}"`).join(",")})`;
}