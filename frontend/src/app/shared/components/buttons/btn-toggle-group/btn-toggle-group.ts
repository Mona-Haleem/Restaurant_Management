import { Component, input, model, output } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-btn-toggle-group',
  imports: [MatIcon],
  templateUrl: './btn-toggle-group.html',
  styleUrl: './btn-toggle-group.scss',
  host: {
    role: 'group',
  },
})
export class BtnToggleGroup {
  options = input.required<{ text: string; icon?: string }[]>();
  selected = model.required<string>();
  onToggle = input<((value: string) => void) | undefined>(undefined);
  selectionChange = output<string>();

  handleClick(option: string) {
    this.selected.set(option);
    this.selectionChange.emit(option);
    this.onToggle()?.(option);
  }
}
