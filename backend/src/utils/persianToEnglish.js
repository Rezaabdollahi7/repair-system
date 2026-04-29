/**
 * تبدیل اعداد فارسی به انگلیسی
 * @param {string} str - رشته ورودی
 * @returns {string} - رشته با اعداد انگلیسی
 */
function persianToEnglish(str) {
  if (!str) return str;
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const englishDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  let result = str;
  for (let i = 0; i < 10; i++) {
    result = result.replaceAll(persianDigits[i], englishDigits[i]);
  }
  return result;
}

module.exports = persianToEnglish;
