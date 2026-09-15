import { Component, input, output, signal, HostListener, inject, ElementRef } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

export interface DropdownItem {
  /** Unique identifier for the item */
  id: string;
  /** Display label */
  label: string;
  /** Material Symbols icon name (optional) */
  icon?: string;
  /** Renders item in destructive/danger style */
  danger?: boolean;
  /** Renders a divider rule BEFORE this item */
  divider?: boolean;
  /** Disables the item */
  disabled?: boolean;
}

@Component({
  selector: 'app-dropdown-menu',
  standalone: true,
  imports: [MatIcon],
  templateUrl: './dropdown-menu.html',
  styleUrl: './dropdown-menu.scss',
  host: {
    class: 'dropdown-host',
    '[class.is-open]': 'isOpen()',
  },
})
export class DropdownMenu {
  private readonly el = inject(ElementRef);

  /** Items to render in the menu */
  items = input.required<DropdownItem[]>();

  /**
   * Trigger button style:
   * - `'dots'`   — vertical three-dot icon (⋮), used for row-action menus
   * - `'avatar'` — initials circle, used for account/user menus
   */
  triggerType = input<'dots' | 'avatar'>('dots');

  /** Initials to display inside the avatar trigger (e.g. "TK") */
  avatarText = input<string>('');

  /** CSS background color for the avatar circle (falls back to --color-primary) */
  avatarColor = input<string>('');

  /**
   * Panel placement relative to the trigger:
   * - `'bottom-end'`   — aligns to the trailing edge (default, right-aligned)
   * - `'bottom-start'` — aligns to the leading edge (left-aligned)
   */
  placement = input<'bottom-end' | 'bottom-start'>('bottom-end');

  /** Emits the selected DropdownItem when the user clicks a non-disabled item */
  itemClick = output<DropdownItem>();

  isOpen = signal(false);

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  select(item: DropdownItem): void {
    if (item.disabled) return;
    this.itemClick.emit(item);
    this.isOpen.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.isOpen.set(false);
    }
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.isOpen.set(false);
  }
}
