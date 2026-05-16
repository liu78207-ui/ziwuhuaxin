const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520
];

const MIN_YEAR = 1900;
const MAX_YEAR = MIN_YEAR + LUNAR_INFO.length - 1;
const BASE_DATE = new Date(1900, 0, 31);
const DAY_MS = 24 * 60 * 60 * 1000;

const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const MONTH_NAMES = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const DAY_PREFIX = ['初', '十', '廿', '三'];
const DAY_NAMES = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function normalizeDate(date) {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function leapMonth(year) {
  return LUNAR_INFO[year - MIN_YEAR] & 0xf;
}

function leapDays(year) {
  if (leapMonth(year)) {
    return (LUNAR_INFO[year - MIN_YEAR] & 0x10000) ? 30 : 29;
  }
  return 0;
}

function monthDays(year, month) {
  return (LUNAR_INFO[year - MIN_YEAR] & (0x10000 >> month)) ? 30 : 29;
}

function yearDays(year) {
  let sum = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (LUNAR_INFO[year - MIN_YEAR] & bit) {
      sum++;
    }
  }
  return sum + leapDays(year);
}

function formatYearName(year) {
  return `${GAN[(year - 4) % 10]}${ZHI[(year - 4) % 12]}年`;
}

function formatMonthName(month, isLeapMonth) {
  return `${isLeapMonth ? '闰' : ''}${MONTH_NAMES[month - 1]}`;
}

function formatDayName(day) {
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  return `${DAY_PREFIX[Math.floor(day / 10)]}${DAY_NAMES[day % 10]}`;
}

function solarToLunar(inputDate) {
  const date = normalizeDate(inputDate);
  if (!date || date < BASE_DATE) return null;

  let offset = Math.floor((date - BASE_DATE) / DAY_MS);
  let lunarYear = MIN_YEAR;

  while (lunarYear <= MAX_YEAR && offset >= yearDays(lunarYear)) {
    offset -= yearDays(lunarYear);
    lunarYear++;
  }

  if (lunarYear > MAX_YEAR) return null;

  const leap = leapMonth(lunarYear);
  let lunarMonth = 1;
  let isLeapMonth = false;

  while (lunarMonth <= 12) {
    let daysOfMonth = isLeapMonth ? leapDays(lunarYear) : monthDays(lunarYear, lunarMonth);
    if (offset < daysOfMonth) {
      break;
    }

    offset -= daysOfMonth;

    if (leap === lunarMonth && !isLeapMonth) {
      isLeapMonth = true;
    } else {
      if (isLeapMonth) {
        isLeapMonth = false;
      }
      lunarMonth++;
    }
  }

  const lunarDay = offset + 1;
  return {
    lunarYear,
    lunarYearName: formatYearName(lunarYear),
    lunarMonth,
    lunarMonthName: formatMonthName(lunarMonth, isLeapMonth),
    lunarDay,
    lunarDayName: formatDayName(lunarDay),
    isLeapMonth
  };
}

function formatFullLunarDate(lunar) {
  return `${lunar.lunarYearName}${lunar.lunarMonthName}${lunar.lunarDayName}`;
}

function formatMonthDay(lunar) {
  return `${lunar.lunarMonthName}${lunar.lunarDayName}`;
}

function formatLunarRange(startDate, endDate) {
  const start = solarToLunar(startDate);
  const end = solarToLunar(endDate);
  if (!start || !end) return '';

  if (start.lunarYear === end.lunarYear) {
    if (start.lunarMonth === end.lunarMonth && start.isLeapMonth === end.isLeapMonth) {
      return `${start.lunarMonthName}${start.lunarDayName} - ${end.lunarDayName}`;
    }
    return `${formatMonthDay(start)} - ${formatMonthDay(end)}`;
  }

  return `${formatFullLunarDate(start)} - ${formatFullLunarDate(end)}`;
}

module.exports = {
  solarToLunar,
  formatLunarRange
};
