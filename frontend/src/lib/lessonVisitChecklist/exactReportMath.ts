export type ExactValue = { numerator: string; denominator: string };
export type Fraction = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
export function fraction(n: bigint, d = 1n): Fraction {
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export function exactNumber(value: number | ExactValue): Fraction {
  if (typeof value === "object")
    return fraction(BigInt(value.numerator), BigInt(value.denominator));
  const [decimal, exponent = "0"] = String(value).toLowerCase().split("e");
  const [whole, tail = ""] = decimal.split(".");
  const places = tail.length - Number(exponent),
    n = BigInt(whole + tail);
  return places >= 0
    ? fraction(n, 10n ** BigInt(places))
    : fraction(n * 10n ** BigInt(-places));
}
export function exactSum(values: Fraction[]): Fraction {
  return values.reduce(
    (s, v) => fraction(s.n * v.d + v.n * s.d, s.d * v.d),
    fraction(0n),
  );
}
export function exactMean(values: Fraction[]): Fraction | null {
  if (!values.length) return null;
  const sum = exactSum(values);
  return fraction(sum.n, sum.d * BigInt(values.length));
}
export function scaleFraction(
  value: Fraction,
  numerator: number,
  denominator = 1,
): Fraction {
  return fraction(value.n * BigInt(numerator), value.d * BigInt(denominator));
}
export function numberOf(value: Fraction): number {
  return Number(value.n) / Number(value.d);
}
export function serializeFraction(value: Fraction): ExactValue {
  return { numerator: String(value.n), denominator: String(value.d) };
}
export function differenceAtLeast(a: Fraction, b: Fraction, threshold: number) {
  const n = a.n * b.d - b.n * a.d;
  return (n < 0n ? -n : n) >= BigInt(threshold) * a.d * b.d;
}
