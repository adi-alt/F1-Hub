import { useId, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, CircleAlert } from "lucide-react";

// No "use client": nothing here holds state, so a Field renders in a Server Component too (a server
// form with no handlers), and a Client Component can still pass it onChange and friends.

/** What a Field hands its control: the id its label points at, the hint and error ids for
 * aria-describedby (undefined when there are neither), and whether the value is invalid. */
export type FieldControlProps = { id: string; describedBy: string | undefined; invalid: boolean };

type FieldOwnProps = {
  label: ReactNode;
  /** Lasting guidance, shown below the control. */
  hint?: ReactNode;
  /** Marks the control invalid and says why, in danger text with an icon. */
  error?: ReactNode;
  /** Replaces the generated control id, e.g. for an error summary that links to the field. */
  id?: string;
  /** Layout only: margin, width, grid placement. */
  className?: string;
};

/** The standard styling for a native input, select or textarea inside a Field: at least 40px tall,
 * surface-2 fill, a border-strong boundary (danger when invalid) that brightens on focus. Body-size text,
 * so iOS Safari doesn't zoom the page when the control is focused. */
export function fieldControlClass(invalid: boolean): string {
  return [
    "min-h-10 w-full rounded-control border bg-surface-2 px-3 py-1.5 text-body text-primary placeholder:text-tertiary",
    "transition-colors duration-fast ease-standard motion-reduce:transition-none",
    // Focus: the boundary brightens and the fill lifts, instead of a thick white ring two pixels outside the field
    // (which read as a stray white border, most of all in the sign-in dialog, where the email field is focused on open).
    "focus-visible:outline-none focus-visible:border-secondary focus-visible:bg-surface-3",
    "disabled:cursor-not-allowed disabled:border-subtle disabled:text-disabled",
    invalid ? "border-danger" : "border-strong",
  ].join(" ");
}

/**
 * The shared wrapper for form controls (spec §4.7): a visible label, an optional hint and an
 * optional error, wired to whatever native control `children` renders. `children` receives the id,
 * aria-describedby and invalid flag (FieldControlProps) to put on the control, plus
 * fieldControlClass(invalid) for its styling:
 *
 *   <Field label="Email" hint="We never show it" error={error}>
 *     {({ id, describedBy, invalid }) => <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className={fieldControlClass(invalid)} />}
 *   </Field>
 */
export function Field({ label, hint, error, id, className = "", children }: FieldOwnProps & { children: (control: FieldControlProps) => ReactNode }) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const invalid = Boolean(error);

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={controlId} className="text-body-sm font-medium text-primary">
        {label}
      </label>
      {children({ id: controlId, describedBy, invalid })}
      {hint && (
        <p id={hintId} className="text-body-sm text-secondary">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-body-sm text-danger">
          <CircleAlert aria-hidden size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      )}
    </div>
  );
}

/** A text-like input (text, email, search, number...) in a Field. Every native input prop passes
 * through except className and style. */
export function TextInput({
  label,
  hint,
  error,
  id,
  className,
  type = "text",
  ...inputProps
}: FieldOwnProps & Omit<ComponentProps<"input">, "id" | "className" | "style" | "children" | "aria-describedby" | "aria-invalid">) {
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className}>
      {({ id: controlId, describedBy, invalid }) => (
        <input {...inputProps} id={controlId} type={type} aria-describedby={describedBy} aria-invalid={invalid || undefined} className={fieldControlClass(invalid)} />
      )}
    </Field>
  );
}

/** A native select in a Field, with a chevron in place of the browser's own arrow. Pass the
 * <option>s as children; every other native select prop passes through except className and style. */
export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...selectProps
}: FieldOwnProps & Omit<ComponentProps<"select">, "id" | "className" | "style" | "aria-describedby" | "aria-invalid">) {
  return (
    <Field label={label} hint={hint} error={error} id={id} className={className}>
      {({ id: controlId, describedBy, invalid }) => (
        <div className="relative">
          <select
            {...selectProps}
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={`peer appearance-none pe-9 ${fieldControlClass(invalid)}`}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden
            size={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-secondary peer-disabled:text-disabled"
          />
        </div>
      )}
    </Field>
  );
}
