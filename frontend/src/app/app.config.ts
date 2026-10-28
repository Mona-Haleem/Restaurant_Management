import {
  ApplicationConfig,
  ErrorHandler,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './core/services/language/transloco-loader';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { GlobalErrorHandler } from './core/handlers/global-error-handler';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['en', 'ar'],
        defaultLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({
        paramsInheritanceStrategy: 'always',
      }),
    ),
  ],
};
