/** Small display helpers. No formatting decision changes meaning. */

export function shortHash(value: string | undefined, head = 10, tail = 6): string {
  if (!value) return "-";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function timestamp(seconds: number | undefined): string {
  if (!seconds) return "-";
  return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function relative(seconds: number | undefined): string {
  if (!seconds) return "-";
  const delta = Math.floor(Date.now() / 1000) - seconds;
  const abs = Math.abs(delta);
  const units: [number, string][] = [
    [86400 * 365, "year"],
    [86400 * 30, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size);
      const plural = n === 1 ? "" : "s";
      return delta >= 0 ? `${n} ${name}${plural} ago` : `in ${n} ${name}${plural}`;
    }
  }
  return delta >= 0 ? "just now" : "shortly";
}

/** Render an 18-decimal amount without floating point. */
export function gen(amount: string | undefined): string {
  if (!amount) return "-";
  const digits = amount.replace(/[^0-9]/g, "").padStart(19, "0");
  const whole = digits.slice(0, -18).replace(/^0+(?=\d)/, "");
  const frac = digits.slice(-18).replace(/0+$/, "");
  return frac ? `${whole}.${frac} GEN` : `${whole} GEN`;
}

export function humanCategory(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function countdown(deadline: number | undefined): string {
  if (!deadline) return "-";
  const remaining = deadline - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "closed";
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}
