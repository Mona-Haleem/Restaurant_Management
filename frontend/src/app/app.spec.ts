import { TestBed } from '@angular/core/testing';
import { render } from '@testing-library/angular';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { App } from './app';
import { ErrorStateService } from './core/services/error-state/error-state.service';

// Minimal translations required by <app-error-boundary> template
const testTranslations = {
  errors: {
    unexpected: {
      code: 'ERR-500',
      title: 'Something Went Wrong',
      description: 'An unexpected error occurred.',
      tryAgain: 'Try Again',
      actionsLabel: 'Error recovery actions',
    },
    goHome: 'Go Home',
  },
};

const translocoTesting = TranslocoTestingModule.forRoot({
  langs: { en: testTranslations },
  translocoConfig: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: true },
  preloadLangs: true,
});

async function setup() {
  const renderResult = await render(App, {
    imports: [translocoTesting],
    providers: [provideRouter([])],
  });
  const errorState = TestBed.inject(ErrorStateService);
  return { renderResult, errorState };
}

describe('App', () => {
  describe('successful render', () => {
    it('should create the component', async () => {
      const { renderResult } = await setup();
      expect(renderResult.fixture.componentInstance).toBeTruthy();
    });

    it('should render the router-outlet when there is no error', async () => {
      const { renderResult } = await setup();
      expect(renderResult.container.querySelector('router-outlet')).toBeTruthy();
    });

    it('should NOT render the error boundary when there is no error', async () => {
      const { renderResult } = await setup();
      expect(renderResult.container.querySelector('app-error-boundary')).toBeNull();
    });
  });

  describe('error state', () => {
    it('should render the error boundary when an error is set', async () => {
      const { renderResult, errorState } = await setup();

      errorState.setError(new Error('Test error'));
      renderResult.fixture.detectChanges();

      expect(renderResult.container.querySelector('app-error-boundary')).toBeTruthy();
    });

    it('should NOT render the router-outlet when an error is active', async () => {
      const { renderResult, errorState } = await setup();

      errorState.setError(new Error('Test error'));
      renderResult.fixture.detectChanges();

      expect(renderResult.container.querySelector('router-outlet')).toBeNull();
    });

    it('should restore the router-outlet after the error is cleared', async () => {
      const { renderResult, errorState } = await setup();

      errorState.setError(new Error('Temporary error'));
      renderResult.fixture.detectChanges();
      expect(renderResult.container.querySelector('app-error-boundary')).toBeTruthy();

      errorState.clearError();
      renderResult.fixture.detectChanges();
      expect(renderResult.container.querySelector('app-error-boundary')).toBeNull();
      expect(renderResult.container.querySelector('router-outlet')).toBeTruthy();
    });
  });
});
