import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import {useSettingStore} from "@/store/setting.js";
const settingStore = useSettingStore();
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale(settingStore.lang === 'en' ? 'en' : 'zh-cn')
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Shared clock formatter for mail lists and message metadata. */
export function formatTime(time) {
    const d = dayjs.utc(time).tz(timeZone);
    return settingStore.timeFormat === '12h' ? d.format('h:mm A') : d.format('HH:mm');
}

export function fromNow(date) {
    const d = dayjs.utc(date).tz(timeZone);
    const now = dayjs();
    const diffSeconds = now.diff(d, 'second');
    const diffMinutes = now.diff(d, 'minute');
    const diffHours = now.diff(d, 'hour');
    const isToday = now.isSame(d, 'day');
    if (settingStore.lang === 'en') {

        if (isToday) {
            if (diffSeconds < 60) return `Just now`;
            if (diffMinutes < 60) return `${diffMinutes} min ago`;
            if (diffHours < 2) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
            return formatTime(date);
        }

        if (now.subtract(1, 'day').isSame(d, 'day')) {
            return d.format('MMM D');
        }

        return d.year() === now.year()
            ? d.format('MMM D')
            : d.format('YYYY/MM/DD');


    } else {

        if (isToday) {
            if (diffSeconds < 60) return `几秒前`;
            if (diffMinutes < 60) return `${diffMinutes}分钟前`;
            if (diffHours >= 1 && diffHours < 2) return '1小时前';
            return formatTime(date);
        }
        else if (now.subtract(1, 'day').isSame(d, 'day')) {
            return `昨天 ${formatTime(date)}`;
        }
        else if (now.subtract(2, 'day').isSame(d, 'day')) {
            return `前天 ${formatTime(date)}`;
        }
        return d.year() === now.year()
            ? d.format('M月D日')
            : d.format('YYYY/M/D');

    }

}

export function updateNow(date) {
    if (isToday) {
        if (diffSeconds < 60) return `Just now`;
        if (diffMinutes < 60) return `${diffMinutes} min ago`;
        if (diffHours < 2) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return d.format('hh:mm A');
    }
}

export function formatDetailDate(time) {
    const d = dayjs.utc(time).tz(timeZone);
    const now = dayjs();

    const isSameYear = now.year() === d.year();

    if (settingStore.lang === 'en') {
        return isSameYear
            ? d.format('ddd, MMM D, ') + formatTime(time)
            : d.format('ddd, MMM D, YYYY, ') + formatTime(time);
    } else {
        return d.format('YYYY年M月D日 ddd ') + formatTime(time);
    }
}

/**
 * Compact timestamp for the mobile conversation header.
 *
 * Today → clock time ("7:37 AM" / "07:37"), otherwise a short date
 * ("Sep 19" / "9月19日"). The desktop reader keeps the full
 * `formatDetailDate` string; this is only used under the 767px breakpoint.
 */
export function formatCompactDate(time) {
    const d = dayjs.utc(time).tz(timeZone);
    const now = dayjs();

    if (now.isSame(d, 'day')) {
        return formatTime(time);
    }

    if (now.year() === d.year()) {
        return settingStore.lang === 'en' ? d.format('MMM D') : d.format('M月D日');
    }

    return settingStore.lang === 'en' ? d.format('MMM D, YYYY') : d.format('YYYY年M月D日');
}

/**
 * Fixed clock label for the mobile Inbox list.
 *
 * Today's mail always reads as a clock (`HH:mm` or `h:mm A`, based on the
 * personal preference) instead of relative wording, so the right column scans
 * as one aligned set of timestamps. Anything older keeps the same calendar
 * label the list already showed.
 *
 * Today is a clock; older messages use the current interface language so a
 * Chinese Inbox keeps the day component (for example "10月2日").
 */
export function formatListClock(time) {
    const isEnglish = settingStore.lang === 'en';
    const d = dayjs.utc(time).tz(timeZone).locale(isEnglish ? 'en' : 'zh-cn');
    const now = dayjs();

    if (now.isSame(d, 'day')) return formatTime(time);

    if (isEnglish) {
        return now.year() === d.year()
            ? d.format('MMM D')
            : d.format('YYYY/MM/DD');
    }

    return now.year() === d.year()
        ? d.format('M月D日')
        : d.format('YYYY年M月D日');
}

export function tzDayjs(time) {
    return dayjs.utc(time).tz(timeZone)
}

export function toUtc(time) {
    return dayjs(time).utc()
}

export function setExtend(lang) {
    dayjs.locale(lang)
}
