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
  private initialAriaDescribedBy: string | null = null;

  constructor() {
    effect(() => {
      this.ensureStructure();
      this.syncRequiredAttribute(this.required());
      this.syncDisabledState(this.computedDisabled());
      this.syncInvalid(this.computedInvalid());
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

    this.initialAriaDescribedBy = host.getAttribute('aria-describedby');

    const wrapper = this.renderer.createElement('div');
    this.renderer.addClass(wrapper, 'field');
    this.renderer.insertBefore(parent, wrapper, host);

    if (!host.id) {
      this.renderer.setAttribute(host, 'id', `input-field-${++nextFieldId}`);
    }

    this.renderer.removeChild(parent, host);
    this.renderer.appendChild(wrapper, host);

    this.wrapperEl = wrapper;

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
      this.renderer.setAttribute(host, 'aria-required', 'true');
    } else {
      this.renderer.removeAttribute(host, 'required');
      this.renderer.removeAttribute(host, 'aria-required');
    }
  }

  private syncDisabledState(isDisabled: boolean): void {
    const host = this.elementRef.nativeElement;
    if (this.disabled() !== undefined) {
      if (isDisabled) {
        this.renderer.setAttribute(host, 'disabled', '');
        this.renderer.setAttribute(host, 'aria-disabled', 'true');
      } else {
        this.renderer.removeAttribute(host, 'disabled');
        this.renderer.removeAttribute(host, 'aria-disabled');
      }
    }
  }

  private syncInvalid(isInvalid: boolean): void {
    const host = this.elementRef.nativeElement;
    if (isInvalid) {
      this.renderer.setAttribute(host, 'aria-invalid', 'true');
    } else {
      this.renderer.removeAttribute(host, 'aria-invalid');
    }
  }

  private syncLabel(): void {
    if (!this.wrapperEl) {
      return;
    }

    const text = this.appInputField()?.trim();
    if (!text) {
      if (this.labelEl) {
        this.renderer.removeChild(this.wrapperEl, this.labelEl);
        this.labelEl = null;
      }
      return;
    }

    if (!this.labelEl) {
      this.labelEl = this.renderer.createElement('label');
      this.renderer.addClass(this.labelEl, 'input-label');
      this.renderer.setAttribute(this.labelEl, 'for', this.elementRef.nativeElement.id);
      this.renderer.insertBefore(this.wrapperEl, this.labelEl, this.elementRef.nativeElement);
    }

    this.renderer.setProperty(this.labelEl, 'textContent', text);
    this.toggleClass(this.labelEl!, 'is-required', this.required());
    this.toggleClass(this.labelEl!, 'is-focused', this.computedFocused());
    this.toggleClass(this.labelEl!, 'is-disabled', this.computedDisabled());
    this.toggleClass(this.labelEl!, 'is-invalid', this.computedInvalid());
  }

  private syncHint(text: string | undefined): void {
    if (!this.wrapperEl) {
      return;
    }

    if (!text) {
      if (this.hintEl) {
        this.renderer.removeChild(this.wrapperEl, this.hintEl);
        this.hintEl = null;
        this.syncAriaDescribedBy();
      }
      return;
    }

    if (!this.hintEl) {
      this.hintEl = this.renderer.createElement('span');
      this.renderer.addClass(this.hintEl, 'input-hint');
      this.renderer.setAttribute(this.hintEl, 'id', `${this.elementRef.nativeElement.id}-hint`);
      this.renderer.appendChild(this.wrapperEl, this.hintEl);
    }
    this.renderer.setProperty(this.hintEl, 'textContent', text);
    this.syncAriaDescribedBy();
  }

  private syncError(text: string | undefined): void {
    if (!this.wrapperEl) {
      return;
    }

    if (!text) {
      if (this.errorEl) {
        this.renderer.removeChild(this.wrapperEl, this.errorEl);
        this.errorEl = null;
        this.syncAriaDescribedBy();
      }
      return;
    }

    if (!this.errorEl) {
      this.errorEl = this.renderer.createElement('span');
      this.renderer.addClass(this.errorEl, 'input-error');
      this.renderer.setAttribute(this.errorEl, 'id', `${this.elementRef.nativeElement.id}-error`);
      this.renderer.setAttribute(this.errorEl, 'role', 'alert');
      this.renderer.setAttribute(this.errorEl, 'aria-live', 'polite');
      this.renderer.appendChild(this.wrapperEl, this.errorEl);
    }
    this.renderer.setProperty(this.errorEl, 'textContent', text);
    this.syncAriaDescribedBy();
  }

  private syncAriaDescribedBy(): void {
    const host = this.elementRef.nativeElement;
    const ids: string[] = [];

    if (this.initialAriaDescribedBy) {
      ids.push(this.initialAriaDescribedBy);
    }
    if (this.errorEl?.id) {
      ids.push(this.errorEl.id);
    }
    if (this.hintEl?.id) {
      ids.push(this.hintEl.id);
    }

    if (ids.length > 0) {
      this.renderer.setAttribute(host, 'aria-describedby', ids.join(' '));
    } else {
      this.renderer.removeAttribute(host, 'aria-describedby');
    }

    if (this.errorEl?.id) {
      this.renderer.setAttribute(host, 'aria-errormessage', this.errorEl.id);
    } else {
      this.renderer.removeAttribute(host, 'aria-errormessage');
    }
  }

  private toggleClass(el: Element, className: string, on: boolean): void {
    if (on) {
      this.renderer.addClass(el, className);
    } else {
      this.renderer.removeClass(el, className);
    }
  }
}
