export function rupiah(n: number): string {
  return (n < 0 ? "-" : "") + "Rp " + Math.abs(n).toLocaleString("id-ID");
}
