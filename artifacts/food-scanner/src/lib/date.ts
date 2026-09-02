import { format, parseISO, addDays, subDays, isToday, isYesterday, isTomorrow } from "date-fns";

export function getTodayStr() {
  return format(new Date(), "yyyy-MM-dd");
}

export function formatDateStr(dateStr: string) {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch (e) {
    return dateStr;
  }
}

export function formatRelativeDate(dateStr: string) {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    if (isTomorrow(d)) return "Tomorrow";
    return format(d, "MMM d, yyyy");
  } catch (e) {
    return dateStr;
  }
}

export function addDaysToStr(dateStr: string, amount: number) {
  return format(addDays(parseISO(dateStr), amount), "yyyy-MM-dd");
}
