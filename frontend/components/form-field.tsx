import { cloneElement, useId, type ReactElement } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

type ControlProps = {
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function FormField({
  label,
  error,
  optional = false,
  className,
  children,
}: {
  label: string;
  className?: string;
  error?: string;
  optional?: boolean;
  children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Field
      data-invalid={error ? true : undefined}
      className={className}
    >
      <FieldLabel htmlFor={id}>
        {label}
        {optional && (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </FieldLabel>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      })}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </Field>
  );
}
