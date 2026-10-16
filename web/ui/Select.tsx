import * as SelectPrimitive from '@radix-ui/react-select';
import { useRef, useState } from 'react';
import './components.css';

export type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };
export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  label: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={up ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Labels and option text are supplied by callers, using their current locale. */
export function Select({
  value,
  onValueChange,
  options,
  label,
  id,
  disabled,
  className = '',
}: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Keep popups inside custom dialogs so their focus management remains scoped.
  const container = trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined;
  const groups = new Map<string | undefined, SelectOption[]>();
  for (const option of options)
    groups.set(option.group, [...(groups.get(option.group) || []), option]);
  const item = (option: SelectOption) => (
    <SelectPrimitive.Item
      key={option.value}
      value={option.value}
      disabled={option.disabled}
      className="ui-select-option"
    >
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="ui-select-indicator" aria-hidden="true">
        ✓
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
    >
      <SelectPrimitive.Trigger
        ref={trigger}
        id={id}
        aria-label={label}
        className={'ui-select-trigger ' + className}
        data-ui-popup-open={open ? 'true' : undefined}
        data-ui-select-open={open ? 'true' : undefined}
      >
        <SelectPrimitive.Value placeholder={label} />
        <SelectPrimitive.Icon className="ui-select-chevron" aria-hidden="true">
          <Chevron />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          className="ui-select-content"
          position="popper"
          sideOffset={7}
          collisionPadding={12}
        >
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll" aria-hidden="true">
            <Chevron up />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {[...groups].map(([label, entries]) =>
              label ? (
                <SelectPrimitive.Group key={label} className="ui-select-group">
                  <SelectPrimitive.Label className="ui-select-group-label">
                    {label}
                  </SelectPrimitive.Label>
                  {entries.map(item)}
                </SelectPrimitive.Group>
              ) : (
                entries.map(item)
              ),
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll" aria-hidden="true">
            <Chevron />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
