import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { InputFieldDirective } from '../../directives/input-label/input-label.directive';

export type SearchInputVariant = 'primary-container' | 'light';
export type SearchInputSize = 'sm' | 'default' | 'lg';

@Component({
  selector: 'app-search-input, app-search-field',
  standalone: true,
  imports: [MatIcon, InputFieldDirective],
  templateUrl: './search-input.html',
  styleUrl: './search-input.scss',
  host: {
    '[class.search-light]': "variant() === 'light'",
    '[class.search-sm]': "size() === 'sm'",
    '[class.search-lg]': "size() === 'lg'",
    '[class.is-disabled]': 'disabled()',
    '[class.is-focused]': 'isFocused()',

    '[style.margin-top]': "label() ? null : '0'",
    '[style.margin-bottom]': "hint() ? null : '0'",
  },
})
export class SearchInput {
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('inputEl') private readonly inputRef?: ElementRef<HTMLInputElement>;

  readonly debounceTime = input<number>(300);

  readonly variant = input<SearchInputVariant>('primary-container');

  readonly size = input<SearchInputSize>('default');
  readonly ariaLabel = input<string>('');
  readonly clearAriaLabel = input<string>('Clear search');

  readonly searchCallback = input<((query: string) => void) | undefined>(undefined);

  readonly label = input<string>('');

  readonly placeholder = input<string>('Search...');
  readonly hint = input<string | undefined>(undefined);
  readonly disabled = input(false, { transform: booleanAttribute });

  /** Two-way bindable value: <app-search-input [(value)]="query" /> */
  readonly value = model('');

  /** Debounced search output event */
  readonly query = output<string>();

  readonly isFocused = signal(false);
  readonly hasValue = computed(() => Boolean(this.value()));

  /** Single reactive source of truth for the wrapper's state classes */

  private lastEmittedValue = '';
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.debounceTimer));
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (value !== this.lastEmittedValue) {
        this.emitSearch(value);
      }
    }, this.debounceTime());
  }

  onBlur(): void {
    this.isFocused.set(false);
  }

  focusInput(): void {
    this.inputRef?.nativeElement.focus();
  }

  clear(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.disabled()) return;

    clearTimeout(this.debounceTimer);
    this.value.set('');
    this.focusInput();
    this.emitSearch('');
  }

  private emitSearch(query: string): void {
    this.lastEmittedValue = query;
    this.query.emit(query);
    this.searchCallback()?.(query);
  }
}
