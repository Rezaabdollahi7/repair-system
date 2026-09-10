import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { useGoToPersonnel } from "../utils/navigation";

/**
 * A member of staff's name, wherever it appears, as a way to their page.
 *
 * Three things this has to get right, which is why it is one component
 * rather than a link written out at each of the five call sites:
 *
 * - **`/personnel/:id` is admin-only.** A technician who followed the link
 *   would be bounced to `/devices`, so for them the name stays plain text.
 *   The guard is in App.tsx; this only avoids offering a door that is
 *   locked.
 * - **Most of these names sit inside a clickable row**, which would
 *   otherwise open the device as well. Hence a `<button>` that stops the
 *   event rather than an `<a>`.
 * - **Some sit inside a modal.** Navigating with the dialog still open
 *   would leave it floating over a page it has nothing to do with, so the
 *   stack is closed on the way out.
 */
export default function PersonnelLink({
  id,
  name,
  tone = "link",
  className = "",
}: {
  id: number;
  name: string;
  /**
   * `link` paints the name in the brand colour. `inherit` keeps whatever
   * ink surrounds it and relies on the hover underline — for the devices
   * list, where a blue name in every row of the technician column would
   * pull the eye off the status, which is the column that matters.
   */
  tone?: "link" | "inherit";
  /** Merged in — for a size or weight the site needs. */
  className?: string;
}) {
  const { isAtLeast } = useAuth();
  const { closeAllModals } = useModal();
  const goToPersonnel = useGoToPersonnel();

  if (!isAtLeast("admin")) {
    return <span className={className}>{name}</span>;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        closeAllModals();
        goToPersonnel(id);
      }}
      className={`hover:underline rounded-field focus-visible:outline-none
                  focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    tone === "link" ? "text-primary font-medium" : ""
                  } ${className}`}
    >
      {name}
    </button>
  );
}
