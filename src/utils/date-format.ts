import dayjs from "dayjs";

export function formatSessionDate(iso: string): string {
    return dayjs(iso).format('ddd, MMM D, YYYY, h:mm A');
}
