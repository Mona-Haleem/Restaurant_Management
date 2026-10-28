import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ErrorBoundary } from './error-boundary';
import { ErrorStateService } from '../../../core/services/error-state/error-state.service';

const testTranslations = {
  errors: {
    unexpected: {
      code: 'ERR-500 · UNEXPECTED ERROR',
      title: 'Something Went Wrong',
      description: 'An unexpected error occurred.',
      tryAgain: 'Try Again',
      actionsLabel: 'Error recovery actions',
    },
    goHome: 'Go Home',
  },
};

async function setup() {
  const user = userEvent.setup();
  const renderResult = await render(ErrorBoundary, {
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en: testTranslations },
        translocoConfig: {
          availableLangs: ['en'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
  });

  const errorState = TestBed.inject(ErrorStateService);
  return { user, renderResult, errorState };
}

describe('ErrorBoundary — user experience and accessibility', () => {
  it('renders an alert landmark with an accessible heading', async () => {
    await setup();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: /something went wrong/i })).toBeTruthy();
  });

  it('displays the error code', async () => {
    await setup();

    expect(screen.getByText(/ERR-500/i)).toBeTruthy();
  });

  it('displays a user-friendly description', async () => {
    await setup();

    expect(screen.getByText(/unexpected error occurred/i)).toBeTruthy();
  });

  it('provides a "Try Again" button', async () => {
    await setup();

    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('provides a "Go Home" button', async () => {
    await setup();

    expect(screen.getByRole('button', { name: /go home/i })).toBeTruthy();
  });

  it('clears the error state when "Try Again" is clicked', async () => {
    const { user, errorState } = await setup();
    errorState.setError(new Error('test'));

    // Stub window.location.reload to prevent actual page reload in tests
    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), href: '' });

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(errorState.hasError()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('clears the error state when "Go Home" is clicked', async () => {
    const { user, errorState } = await setup();
    errorState.setError(new Error('test'));

    vi.stubGlobal('location', { ...window.location, reload: vi.fn(), href: '' });

    await user.click(screen.getByRole('button', { name: /go home/i }));

    expect(errorState.hasError()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('hides decorative icons from screen readers', async () => {
    const { renderResult } = await setup();

    const iconWrap = renderResult.container.querySelector('.icon-wrap');
    expect(iconWrap?.getAttribute('aria-hidden')).toBe('true');

    const buttonIcons = renderResult.container.querySelectorAll(
      '.error-actions .material-symbols-outlined',
    );
    buttonIcons.forEach((icon) => {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
