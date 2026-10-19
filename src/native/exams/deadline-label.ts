const ZONE = 'Asia/Ho_Chi_Minh';

function part(at: number, options: Intl.DateTimeFormatOptions, type: Intl.DateTimeFormatPartTypes): string {
  const found = new Intl.DateTimeFormat('vi-VN', options).formatToParts(new Date(at)).find(item => item.type === type);
  return found?.value ?? '';
}

/** Hiện hạn nộp đã lưu. Không đổi mốc thời gian. Múi giờ nghiệp vụ là Asia/Ho_Chi_Minh.
 * Ghép giờ và ngày bằng chữ "ngày" để dòng hẹp không dính thành "11:06:4119/10/2026". */
export function formatAttemptDeadline(at: number): string {
  if (!Number.isFinite(at) || Number.isNaN(new Date(at).getTime())) return 'Chưa xác định thời điểm';
  const clock = {timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'} as const;
  const calendar = {timeZone: ZONE, day: '2-digit', month: '2-digit', year: 'numeric'} as const;
  const time = `${part(at, clock, 'hour')}:${part(at, clock, 'minute')}:${part(at, clock, 'second')}`;
  const day = `${part(at, calendar, 'day')}/${part(at, calendar, 'month')}/${part(at, calendar, 'year')}`;
  if (!/^\d{2}:\d{2}:\d{2}$/.test(time) || !/^\d{2}\/\d{2}\/\d{4}$/.test(day)) return 'Chưa xác định thời điểm';
  return `${time} ngày ${day}`;
}
