import { useId } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type Option = { value: string; label: string; disabled?: boolean };
type Props = {
  label: string;
  value: string;
  options: readonly Option[];
  onValueChange: (value: string) => void;
  disabled?: boolean;
};

export default function SelectField({ label, value, options, onValueChange, disabled }: Props) {
  const id = useId();
  return <div className="field">
    <label id={`${id}-label`} htmlFor={id}>{label}</label>
    <Select.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <Select.Trigger id={id} className="select-trigger" aria-labelledby={`${id}-label`}>
        <Select.Value/>
        <Select.Icon className="select-chevron"><ChevronDown size={14} strokeWidth={1.75}/></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="select-content" position="popper" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
          <Select.ScrollUpButton className="select-scroll"><ChevronUp size={14}/></Select.ScrollUpButton>
          <Select.Viewport className="select-viewport">
            {options.map(option => <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="select-item">
              <Select.ItemText>{option.label}</Select.ItemText>
              <Select.ItemIndicator className="select-indicator"><Check size={14} strokeWidth={2}/></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll"><ChevronDown size={14}/></Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  </div>;
}
