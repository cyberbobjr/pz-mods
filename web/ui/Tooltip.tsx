import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import './components.css';

type Props = {
  children: ReactElement;
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/** Wrap one focusable button or link. Essential instructions must remain visible too. */
export function Tooltip({ children, content, side = 'top' }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const container = trigger.current?.closest<HTMLElement>('[role="dialog"]') || undefined;
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={100}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger
          asChild
          ref={trigger}
          data-ui-popup-open={open ? 'true' : undefined}
        >
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container}>
          <TooltipPrimitive.Content
            className="ui-tooltip-content"
            side={side}
            sideOffset={8}
            collisionPadding={12}
          >
            {content}
            <TooltipPrimitive.Arrow className="ui-tooltip-arrow" width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
