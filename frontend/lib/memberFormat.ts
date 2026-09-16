const moneyFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export const memberMoney = (value: number) => `${moneyFormat.format(value)}₮`;
export function memberDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = Object.fromEntries(dateFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
