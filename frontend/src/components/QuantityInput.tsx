import NumberInput from "./NumberInput";

interface BaseProps {
  /** The item's own setting. A whole-number item takes no decimal point. */
  fractional: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  placeholder?: string;
  align?: "right" | "center" | "left";
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Two shapes. The usual one treats an empty field as zero. The nullable one
 * — a stock count's line (14.15) — keeps «not entered» apart from «0»,
 * because a counted empty shelf and a shelf nobody has counted yet are
 * different answers.
 */
type QuantityInputProps = BaseProps &
  (
    | { nullable?: false; value: number; onChange: (value: number) => void }
    | {
        nullable: true;
        value: number | null;
        onChange: (value: number | null) => void;
      }
  );

/**
 * A quantity field (14.11): NumberInput with the item's own rule — three
 * decimal places for an item counted in fractions (metres, kilos), none for
 * one counted whole — so «۰٫۴» is taken for cable and refused for a screen.
 * Persian digits and «٫», like every number field in the app.
 */
export default function QuantityInput(props: QuantityInputProps) {
  const { fractional, nullable, ...rest } = props;
  return (
    <NumberInput
      id={rest.id}
      className={rest.className}
      disabled={rest.disabled}
      placeholder={rest.placeholder}
      aria-label={rest["aria-label"]}
      align={rest.align}
      onBlur={rest.onBlur}
      onKeyDown={rest.onKeyDown}
      decimals={fractional ? 3 : 0}
      value={props.value}
      // An empty field reads as zero on an ordinary line; on a count it is
      // «not counted yet», which zero is not.
      zeroAsEmpty={!nullable}
      onChange={(value) => {
        if (props.nullable === true) props.onChange(value);
        else props.onChange(value ?? 0);
      }}
    />
  );
}
