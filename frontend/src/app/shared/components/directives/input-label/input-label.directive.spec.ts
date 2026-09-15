import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InputFieldDirective } from './input-label.directive';

@Component({
  imports: [InputFieldDirective],
  template: `
    <input
      appInputField="Full Legal Name"
      class="input"
      type="text"
      [required]="isRequired"
      [disabled]="isDisabled"
      [class.is-invalid]="isInvalid"
      [hint]="hintText"
      [error]="errorText"
      placeholder="Enter your name"
    />
  `,
})
class TestHostComponent {
  isRequired = false;
  isDisabled = false;
  isInvalid = false;
  hintText: string | undefined = undefined;
  errorText: string | undefined = undefined;
}

describe('InputFieldDirective', () => {
  it('generates a label with base input-label class from the input attribute alone', async () => {
    await render(TestHostComponent);
    const label = screen.getByText('Full Legal Name');
    expect(label.tagName).toBe('LABEL');
    expect(label.classList.contains('input-label')).toBe(true);
  });

  it('wraps the input in a .field container and links label/input via for/id', async () => {
    await render(TestHostComponent);
    const input = screen.getByPlaceholderText('Enter your name');
    const label = screen.getByText('Full Legal Name') as HTMLLabelElement;

    expect(input.closest('.field')).toBeTruthy();
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('adds is-required class and native required attribute when required is true', async () => {
    await render(TestHostComponent, {
      componentProperties: { isRequired: true },
    });
    const label = screen.getByText('Full Legal Name');
    const input = screen.getByPlaceholderText('Enter your name');

    expect(label.classList.contains('is-required')).toBe(true);
    expect(input.hasAttribute('required')).toBe(true);
  });

  it('handles focus and blur states on the input', async () => {
    const user = userEvent.setup();
    await render(TestHostComponent);

    const input = screen.getByPlaceholderText('Enter your name');
    const label = screen.getByText('Full Legal Name');

    expect(label.classList.contains('is-focused')).toBe(false);

    await user.click(input);
    expect(label.classList.contains('is-focused')).toBe(true);

    await user.tab();
    expect(label.classList.contains('is-focused')).toBe(false);
  });

  it('handles disabled state', async () => {
    await render(TestHostComponent, {
      componentProperties: { isDisabled: true },
    });
    const label = screen.getByText('Full Legal Name');
    expect(label.classList.contains('is-disabled')).toBe(true);
  });

  it('handles invalid state', async () => {
    await render(TestHostComponent, {
      componentProperties: { isInvalid: true },
    });
    const label = screen.getByText('Full Legal Name');
    expect(label.classList.contains('is-invalid')).toBe(true);
  });

  it('renders and updates an optional hint span', async () => {
    const { rerender } = await render(TestHostComponent, {
      componentProperties: { hintText: 'Default variant uses --color-primary-container' },
    });
    expect(screen.getByText('Default variant uses --color-primary-container')).toBeTruthy();

    await rerender({ componentProperties: { hintText: undefined } });
    expect(screen.queryByText('Default variant uses --color-primary-container')).toBeNull();
  });

  it('renders and updates an optional error message span', async () => {
    const { rerender } = await render(TestHostComponent, {
      componentProperties: { errorText: 'This field is required' },
    });
    expect(screen.getByText('This field is required')).toBeTruthy();

    const label = screen.getByText('Full Legal Name');
    expect(label.classList.contains('is-invalid')).toBe(true);

    await rerender({ componentProperties: { errorText: undefined } });
    expect(screen.queryByText('This field is required')).toBeNull();
  });
});
