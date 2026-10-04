"use client";

import { useState } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

/** The item that lets people type a value that is not in the list. */
export const OTHER_OPTION = "\u0000other";

type OptionComboboxProps = {
  id: string;
  options: readonly string[];
  /** The selected option, OTHER_OPTION, or null when nothing is selected. */
  value: string | null;
  /** Called with the chosen option, or with OTHER_OPTION and the typed text. */
  onSelect: (value: string | null, typedText: string) => void;
  /** Called whenever the person types into the search box. */
  onType?: () => void;
  otherLabel: string;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * A searchable list of options that always ends with an "other" item, so a
 * value missing from the list never blocks the form.
 */
export function OptionCombobox({
  id,
  options,
  value,
  onSelect,
  onType,
  otherLabel,
  placeholder,
  disabled,
  invalid,
  describedBy,
}: OptionComboboxProps) {
  const [query, setQuery] = useState("");
  const { contains } = ComboboxPrimitive.useFilter({ value });
  const items = [...options, OTHER_OPTION];

  return (
    <Combobox
      items={items}
      filter={(item: string, search, itemToString) =>
        item === OTHER_OPTION || contains(item, search, itemToString)
      }
      value={value}
      itemToStringLabel={(item: string) =>
        item === OTHER_OPTION ? otherLabel : item
      }
      onValueChange={(next: string | null) => {
        onSelect(next, query.trim());
        setQuery("");
      }}
      onInputValueChange={(next, details) => {
        if (details.reason === "input-change") {
          setQuery(next);
          onType?.();
        }
      }}
      disabled={disabled}
      autoHighlight
    >
      <ComboboxInput
        id={id}
        className="w-full"
        placeholder={placeholder}
        disabled={disabled}
        aria-required
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <ComboboxContent>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem
              key={item}
              value={item}
              className={cn(
                item === OTHER_OPTION && "border-t text-muted-foreground",
              )}
            >
              {item === OTHER_OPTION ? otherLabel : item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
