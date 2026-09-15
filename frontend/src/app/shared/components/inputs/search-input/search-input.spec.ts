import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchInput, SearchInputSize, SearchInputVariant } from './search-input';

@Component({
  imports: [SearchInput],
  template: `
    <app-search-input
      label="Search dishes"
      [placeholder]="placeholder"
      [debounceTime]="debounceTime"
      [variant]="variant"
      [size]="size"
      [disabled]="disabled"
      [searchCallback]="callbackFn"
      [(value)]="query"
      (query)="onSearch($event)"
    />
  `,
})
class TestHostComponent {
  placeholder = 'Search dishes...';
  debounceTime = 300;
  disabled = false;
  variant: SearchInputVariant = 'primary-container';
  size: SearchInputSize = 'default';
  query = '';
  callbackFn?: (q: string) => void;
  onSearch = vi.fn();
}

describe('SearchInput (owned input)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders its own labeled input via appInputField', async () => {
    await render(TestHostComponent);

    const input = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(screen.getByText('Search dishes').tagName).toBe('LABEL');

    const icon = screen.getByText('search');
    expect(icon).toBeTruthy();
  });

  it('debounces user typing and emits search event', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { fixture } = await render(TestHostComponent, {
      componentProperties: { debounceTime: 200 },
    });

    const host = fixture.componentInstance;
    const input = screen.getByPlaceholderText('Search dishes...');

    await user.type(input, 'pizza');
    expect(host.onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);

    expect(host.onSearch).toHaveBeenCalledTimes(1);
    expect(host.onSearch).toHaveBeenCalledWith('pizza');
  });

  it('only fires once for the latest value when user types rapidly', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { fixture } = await render(TestHostComponent, {
      componentProperties: { debounceTime: 300 },
    });
    const host = fixture.componentInstance;
    const input = screen.getByPlaceholderText('Search dishes...');

    await user.type(input, 'b');
    vi.advanceTimersByTime(100);
    await user.type(input, 'u');
    vi.advanceTimersByTime(100);
    await user.type(input, 'r');
    vi.advanceTimersByTime(100);
    await user.type(input, 'g');
    vi.advanceTimersByTime(100);
    await user.type(input, 'e');
    vi.advanceTimersByTime(100);
    await user.type(input, 'r');

    expect(host.onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(host.onSearch).toHaveBeenCalledTimes(1);
    expect(host.onSearch).toHaveBeenCalledWith('burger');
  });

  it('invokes user-provided searchCallback function', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const callbackFn = vi.fn();
    await render(TestHostComponent, {
      componentProperties: { debounceTime: 150, callbackFn },
    });

    const input = screen.getByPlaceholderText('Search dishes...');
    await user.type(input, 'salad');

    vi.advanceTimersByTime(150);

    expect(callbackFn).toHaveBeenCalledTimes(1);
    expect(callbackFn).toHaveBeenCalledWith('salad');
  });

  it('binds an initial ngModel value, shows the clear button, and clears on click', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { fixture } = await render(TestHostComponent, {
      componentProperties: { query: 'pasta' },
    });
    const host = fixture.componentInstance;

    const input = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;
    expect(input.value).toBe('pasta');

    const clearButton = screen.getByRole('button', { name: /clear search/i });
    expect(clearButton).toBeTruthy();

    await user.click(clearButton);

    expect(input.value).toBe('');
    expect(host.onSearch).toHaveBeenCalledWith('');
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('does not let a pending debounced value overwrite an immediate clear', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { fixture } = await render(TestHostComponent, {
      componentProperties: { debounceTime: 300 },
    });
    const host = fixture.componentInstance;
    const input = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;

    await user.type(input, 'past');
    vi.advanceTimersByTime(100); // still inside the 300ms debounce window

    const clearButton = screen.getByRole('button', { name: /clear search/i });
    await user.click(clearButton);

    expect(host.onSearch).toHaveBeenCalledTimes(1);
    expect(host.onSearch).toHaveBeenLastCalledWith('');

    // Let the original, now-stale debounce timer for 'past' run out.
    vi.advanceTimersByTime(300);

    expect(host.onSearch).toHaveBeenCalledTimes(1);
    expect(host.onSearch).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
  });

  it('clears search when user presses Escape key', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { fixture } = await render(TestHostComponent, {
      componentProperties: { query: 'soup' },
    });
    const host = fixture.componentInstance;

    const input = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;
    await user.type(input, '{Escape}');

    expect(input.value).toBe('');
    expect(host.onSearch).toHaveBeenCalledWith('');
  });

  it('respects the disabled input: native attribute set, clear button hidden', async () => {
    await render(TestHostComponent, {
      componentProperties: { disabled: true, query: 'locked query' },
    });

    const input = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();
  });

  it('applies light variant and size classes to container', async () => {
    const { container } = await render(TestHostComponent, {
      componentProperties: { variant: 'light', size: 'sm' },
    });

    const searchBox = container.querySelector('.search-box');
    expect(searchBox?.classList.contains('search-light')).toBe(true);
    expect(searchBox?.classList.contains('search-sm')).toBe(true);
  });
});
