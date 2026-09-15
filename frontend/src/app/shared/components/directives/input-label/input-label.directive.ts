import {
  Directive,
  ElementRef,
  OnDestroy,
  Renderer2,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

let nextFieldId = 0;

type FieldHost = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * Put this directly on the input/select/textarea. It generates the wrapping
 * `.field` div, the `<label>`, and (optionally) a hint span — no need to
 * hand-write the label/wrapper markup at every call site.
 *
 * <input appInputField="Full Legal Name" [required]="true" hint="Optional helper text" />
 */
@Directive({
  selector: 'input[appInputField], select[appInputField], textarea[appInputField]',
  standalone: true,
})
export class InputFieldDirective implements OnDestroy {
  private readonly elementRef = inject(ElementRef<FieldHost>);
  private readonly renderer = inject(Renderer2);

  /** Label text: appInputField="Full Legal Name" */
  readonly appInputField = input.required<string>();

  /** Sets the native `required` attribute and styles the label */
  readonly required = input(false, { transform: booleanAttribute });

  /** Optional hint text rendered below the field */
  readonly hint = input<string | undefined>(undefined);

  /** Optional error message rendered below the field */
  readonly error = input<string | undefined>(undefined);

  /** Manual overrides, same escape hatch the old directive had */
  readonly focused = input<boolean | undefined>(undefined);
  readonly disabled = input<boolean | undefined>(undefined);
  readonly invalid = input<boolean | undefined>(undefined);

  private readonly autoFocused = signal(false);
  private readonly autoDisabled = signal(false);
  private readonly autoInvalid = signal(false);

  private readonly computedFocused = computed(() => this.focused() ?? this.autoFocused());
  private readonly computedDisabled = computed(() => this.disabled() ?? this.autoDisabled());
  private readonly computedInvalid = computed(
    () => this.invalid() ?? (Boolean(this.error()) || this.autoInvalid()),
  );

  private wrapperEl: HTMLElement | null = null;
  private labelEl: HTMLLabelElement | null = null;
  private hintEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private mutationObserver?: MutationObserver;

  constructor() {
    effect(() => {
      this.ensureStructure();
      this.syncRequiredAttribute(this.required());
      this.syncLabel();
      this.syncHint(this.hint());
      this.syncError(this.error());
    });
  }

  ngOnDestroy(): void {
    this.mutationObserver?.disconnect();
  }

  /** Builds `.field > label + input` once, moving the host input inside it. */
  private ensureStructure(): void {
    if (this.wrapperEl) {
      return;
    }

    const host = this.elementRef.nativeElement;
    const parent = this.renderer.parentNode(host);
    if (!parent) {
      return;
    }

    const wrapper = this.renderer.createElement('div');
    this.renderer.addClass(wrapper, 'field');
    this.renderer.insertBefore(parent, wrapper, host);

    const label = this.renderer.createElement('label');
    this.renderer.addClass(label, 'input-label');

    if (!host.id) {
      this.renderer.setAttribute(host, 'id', `input-field-${++nextFieldId}`);
    }
    this.renderer.setAttribute(label, 'for', host.id);

    this.renderer.appendChild(wrapper, label);
    this.renderer.removeChild(parent, host);
    this.renderer.appendChild(wrapper, host);

    this.wrapperEl = wrapper;
    this.labelEl = label;

    this.bindStateTracking(host);
  }

  private bindStateTracking(host: FieldHost): void {
    const check = () => this.checkState(host);

    this.renderer.listen(host, 'focus', () => this.autoFocused.set(true));
    this.renderer.listen(host, 'blur', () => {
      this.autoFocused.set(false);
      check();
    });
    this.renderer.listen(host, 'input', check);
    this.renderer.listen(host, 'change', check);

    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(check);
      this.mutationObserver.observe(host, {
        attributes: true,
        attributeFilter: ['disabled', 'aria-invalid', 'class'],
      });
    }

    check();
  }

  private checkState(host: FieldHost): void {
    const inputEl = host as HTMLInputElement;

    this.autoDisabled.set(
      inputEl.disabled ||
        host.hasAttribute('disabled') ||
        host.getAttribute('aria-disabled') === 'true',
    );

    this.autoInvalid.set(
      host.classList.contains('is-invalid') ||
        host.classList.contains('ng-invalid') ||
        host.getAttribute('aria-invalid') === 'true' ||
        (typeof inputEl.checkValidity === 'function' &&
          !inputEl.checkValidity() &&
          inputEl.value !== ''),
    );
  }

  private syncRequiredAttribute(isRequired: boolean): void {
    const host = this.elementRef.nativeElement;
    if (isRequired) {
      this.renderer.setAttribute(host, 'required', '');
    } else {
      this.renderer.removeAttribute(host, 'required');
    }
  }

  private syncLabel(): void {
    if (!this.labelEl) {
      return;
    }
    this.renderer.setProperty(this.labelEl, 'textContent', this.appInputField());
    this.toggleClass(this.labelEl, 'is-required', this.required());
    this.toggleClass(this.labelEl, 'is-focused', this.computedFocused());
    this.toggleClass(this.labelEl, 'is-disabled', this.computedDisabled());
    this.toggleClass(this.labelEl, 'is-invalid', this.computedInvalid());
  }

  private syncHint(text: string | undefined): void {
    if (!this.wrapperEl) {
      return;
    }

    if (!text) {
      if (this.hintEl) {
        this.renderer.removeChild(this.wrapperEl, this.hintEl);
        this.hintEl = null;
      }
      return;
    }

    if (!this.hintEl) {
      this.hintEl = this.renderer.createElement('span');
      this.renderer.addClass(this.hintEl, 'input-hint');
      this.renderer.appendChild(this.wrapperEl, this.hintEl);
    }
    this.renderer.setProperty(this.hintEl, 'textContent', text);
  }

  private syncError(text: string | undefined): void {
    if (!this.wrapperEl) {
      return;
    }

    if (!text) {
      if (this.errorEl) {
        this.renderer.removeChild(this.wrapperEl, this.errorEl);
        this.errorEl = null;
      }
      return;
    }

    if (!this.errorEl) {
      this.errorEl = this.renderer.createElement('span');
      this.renderer.addClass(this.errorEl, 'input-error');
      this.renderer.appendChild(this.wrapperEl, this.errorEl);
    }
    this.renderer.setProperty(this.errorEl, 'textContent', text);
  }

  private toggleClass(el: Element, className: string, on: boolean): void {
    if (on) {
      this.renderer.addClass(el, className);
    } else {
      this.renderer.removeClass(el, className);
    }
  }
}
