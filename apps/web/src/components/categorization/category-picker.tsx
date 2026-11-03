import type { CategorySchema } from "@bessel/client";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@bessel/ui/components/native-select";
import { useMemo } from "react";
import { groupCategories } from "./categorization";

/** A category (never a group) from the user's tree, by group. */
export function CategoryPicker({
  id,
  value,
  onChange,
  categories,
  excludeId,
  placeholder = "Choose a category",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  categories: CategorySchema[];
  excludeId?: string;
  placeholder?: string;
}) {
  const groups = useMemo(
    () =>
      groupCategories(categories)
        .map(({ group, categories }) => ({
          group,
          categories: categories.filter((c) => c.id !== excludeId),
        }))
        .filter((g) => g.categories.length > 0),
    [categories, excludeId],
  );
  return (
    <div className="[&>div]:w-full">
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      >
        <NativeSelectOption value="" disabled>
          {placeholder}
        </NativeSelectOption>
        {groups.map(({ group, categories }) => (
          <NativeSelectOptGroup key={group.id} label={group.name}>
            {categories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
    </div>
  );
}
