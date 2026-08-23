// jalaali-js ships no type declarations. This covers what the export builder
// calls, not the library's full surface — add here when something new gets
// used. The frontend keeps its own copy for the same reason.
declare module "jalaali-js" {
  export interface JalaaliDate {
    jy: number;
    jm: number;
    jd: number;
  }

  export function toJalaali(gy: number, gm: number, gd: number): JalaaliDate;
  export function toJalaali(date: Date): JalaaliDate;

  const jalaali: {
    toJalaali: typeof toJalaali;
  };

  export default jalaali;
}
