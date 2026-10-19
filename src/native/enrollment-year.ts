/** Năm học 2026-2027 trên /khoa-hoc.
 * Lớp 12 sinh năm 2009, thi 2027. Lớp 11 sinh năm 2010, thi 2028. Lớp 10 sinh năm 2011, thi 2029.
 * Khối 9, HSA và TSA không dùng map này. */
export function enrollmentHeadline(grade: string): {year: number; group: number} | null {
  if (grade === '12') return {year: 2027, group: 2009};
  if (grade === '11') return {year: 2028, group: 2010};
  if (grade === '10') return {year: 2029, group: 2011};
  return null;
}
