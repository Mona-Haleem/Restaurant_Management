import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NotFound } from './not-found';

@Component({ standalone: true, template: '<div>Home</div>' })
class DummyHomeComponent {}

const testTranslations = {
  errors: {
    notFound: {
      code: 'ERR-404 · PAGE NOT FOUND',
      title: 'Page Not Found',
      description: "The page you're looking for doesn't exist or has been moved.",
      pageTitle: 'Page Not Found — Tablz',
      metaDescription: 'The requested page could not be found.',
      actionsLabel: 'Error recovery actions',
    },
    goHome: 'Go Home',
    goBack: 'Go Back',
  },
};

async function setup() {
  const user = userEvent.setup();
  const renderResult = await render(NotFound, {
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

describe('NotFound — user experience and accessibility', () => {
  beforeEach(() => {
    document.title = '';
  });

  it('renders a landmark with an accessible heading', async () => {
    await setup();

    const heading = screen.getByRole('heading', { level: 1, name: /page not found/i });
    expect(heading).toBeTruthy();
  });

  it('displays the 404 error code', async () => {
    await setup();

    expect(screen.getByText(/ERR-404/i)).toBeTruthy();
  });

  it('displays a descriptive message', async () => {
    await setup();

    expect(screen.getByText(/doesn't exist or has been moved/i)).toBeTruthy();
  });

  it('provides a "Go Home" link that navigates to /', async () => {
    await setup();

    const homeLink = screen.getByRole('link', { name: /go home/i });
    expect(homeLink).toBeTruthy();
    expect(homeLink.getAttribute('href')).toBe('/');
  });

  it('provides a "Go Back" button', async () => {
    await setup();

    const backBtn = screen.getByRole('button', { name: /go back/i });
    expect(backBtn).toBeTruthy();
  });

  it('calls location.back() when "Go Back" is clicked', async () => {
    const { user } = await setup();
    const location = TestBed.inject(Location);
    const backSpy = vi.spyOn(location, 'back');

    const backBtn = screen.getByRole('button', { name: /go back/i });
    await user.click(backBtn);

    expect(backSpy).toHaveBeenCalledOnce();
  });

  it('sets the document title for SEO', async () => {
    await setup();

    expect(document.title).toBe('Page Not Found — Tablz');
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
