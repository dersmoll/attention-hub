/** The one icon set for manager-class windows.
 *
 * Project Hub and Medicine each had their own copy, and `edit`, `delete`,
 * `archive` and `restore` were the same drawings twice — already differing in
 * how the delete path was split, which is how the next one would have drifted
 * too. Add names here rather than starting a third set. */
export type ActionIconName =
  | "add"
  | "archive"
  | "complete"
  | "delete"
  | "down"
  | "edit"
  | "grip"
  | "notes"
  | "remove"
  | "reopen"
  | "restore"
  | "skip"
  | "take"
  | "undo"
  | "up";

export function ActionIcon({ name }: { name: ActionIconName }) {
  switch (name) {
    case "add":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>;
    case "archive":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8h16v12H4z" /><path d="M3 4h18v4H3z" /><path d="M9 13h6" /></svg>;
    case "complete":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
    case "delete":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="m6 7 1 13h10l1-13" /><path d="M10 11v5M14 11v5" /></svg>;
    case "down":
    case "up":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={name === "up" ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>;
    case "edit":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
    case "grip":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="8" cy="6" r="1" /><circle cx="16" cy="6" r="1" /><circle cx="8" cy="12" r="1" /><circle cx="16" cy="12" r="1" /><circle cx="8" cy="18" r="1" /><circle cx="16" cy="18" r="1" /></svg>;
    case "notes":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /></svg>;
    case "reopen":
    case "undo":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9v5h5M5 13a8 8 0 1 0 2-6" /></svg>;
    case "restore":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8h16v12H4z" /><path d="M3 4h18v4H3z" /><path d="M8 14a4 4 0 1 0 1.2-2.85" /><path d="M8 10v4h4" /></svg>;
    case "skip":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5 5 19" /></svg>;
    case "take":
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>;
    case "remove":
    default:
      return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>;
  }
}
