import NumberInput, { type NumberInputProps } from "./NumberInput";
import { fromRials, moneyDecimals, toRials } from "../utils/currency";

type MoneyInputProps = Omit<NumberInputProps, "decimals" | "separators">;

/**
 * An amount of money, typed in the shop's unit and handed back in rials.
 *
 * `value` and `onChange` speak rials, like the API and every form's state;
 * the field shows and takes تومان or ریال, whichever the shop has chosen
 * (utils/currency). So a form never converts anything itself, and a shop
 * switching unit sees the same prices, written differently.
 *
 * Use it for every price, cost, payment and amount filter — never a bare
 * NumberInput, which would take what is typed as rials. A rate or a count of
 * months is not money and stays a NumberInput.
 */
export default function MoneyInput({
  value,
  onChange,
  ...props
}: MoneyInputProps) {
  return (
    <NumberInput
      {...props}
      // Rounded to the rial first: an average cost is kept to two places
      // (۹۰۸٬۰۲۴٫۶۹ ریال), and a field showing more places than it accepts
      // refuses every keystroke after it.
      value={value === null ? null : fromRials(Math.round(value))}
      onChange={(shown) => onChange(shown === null ? null : toRials(shown))}
      decimals={moneyDecimals()}
    />
  );
}
