// jalaali-js ships no type declarations. This covers the three functions the
// app actually calls (PersianDatePicker), not the library's full surface —
// add here when something new gets used.
declare module "jalaali-js" {
  export interface JalaaliDate {
    jy: number;
    jm: number;
    jd: number;
  }

  export interface GregorianDate {
    gy: number;
    gm: number;
    gd: number;
  }

  export function toJalaali(date: Date): JalaaliDate;
  export function toJalaali(gy: number, gm: number, gd: number): JalaaliDate;

  export function toGregorian(jy: number, jm: number, jd: number): GregorianDate;

  export function jalaaliMonthLength(jy: number, jm: number): number;
}
