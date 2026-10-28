import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Unauthorized } from './unauthorized';

@Component({ standalone: true, template: '<div>Home</div>' })
class DummyHomeComponent {}

const testTranslations = {
  errors: {
    unauthorized: {
      code: 'ERR-403 · AUTHORIZATION REQUIRED',
      title: 'Access Restricted',
      description: "You don't have permission to access this area.",
      pageTitle: 'Access Denied — Tablz',
      metaDescription: 'You do not have permission to view this page.',
      actionsLabel: 'Error recovery actions',
    },
    goHome: 'Go Home',
    goBack: 'Go Back',
  },
};

async function setup() {
  const user = userEvent.setup();
  const renderResult = await render(Unauthorized, {
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
    providers: [provideRouter([{ path: '', component: DummyHomeComponent }])],
  });

  return { user, renderResult };
}

describe('Unauthorized — user experience and accessibility', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('renders a landmark with an accessible heading', async () => {
    await setup();

    const heading = screen.getByRole('heading', { level: 1, name: /access restricted/i });
    expect(heading).toBeTruthy();
  });

  it('displays the 403 error code', async () => {
    await setup();

    expect(screen.getByText(/ERR-403/i)).toBeTruthy();
  });

  it('displays a descriptive access-denied message', async () => {
    await setup();

    expect(screen.getByText(/don't have permission/i)).toBeTruthy();
  });

  it('provides a "Go Home" link that navigates to /', async () => {
    await setup();

    const homeLink = screen.getByRole('link', { name: /go home/i });
    expect(homeLink).toBeTruthy();
    expect(homeLink.getAttribute('href')).toBe('/');
  });

  it('provides a "Go Back" button that calls location.back()', async () => {
    const { user } = await setup();
    const location = TestBed.inject(Location);
    const backSpy = vi.spyOn(location, 'back');

    const backBtn = screen.getByRole('button', { name: /go back/i });
    await user.click(backBtn);

    expect(backSpy).toHaveBeenCalledOnce();
  });

  it('sets the document title for SEO', async () => {
    await setup();

    expect(document.title).toBe('Access Denied — Tablz');
  });

  it('hides decorative icons from screen readers', async () => {
    const { renderResult } = await setup();

    const iconWrap = renderResult.container.querySelector('.icon-wrap');
    expect(iconWrap?.getAttribute('aria-hidden')).toBe('true');
  });
});
