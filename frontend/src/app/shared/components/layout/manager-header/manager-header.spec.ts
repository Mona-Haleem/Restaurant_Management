import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ManagerHeader } from './manager-header';

@Component({
  standalone: true,
  imports: [ManagerHeader],
  template: `
    <header app-manager-header [headerTitle]="title" [isMobile]="isMobile">
      <button type="button" aria-label="Add Item">Add</button>
      <button type="button" aria-label="Export Report">Export</button>
    </header>
  `,
})
class TestHostComponent {
  title = 'dashboard';
  isMobile = false;
}

const mockTranslations = {
  navigation: {
    dashboard: 'Dashboard',
    inventory: 'Inventory',
    actions: 'Actions',
  },
};

describe('ManagerHeader — user experience, accessibility and content projection', () => {
  it('renders a banner landmark and level 1 heading with translated title', async () => {
    await render(TestHostComponent, {
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: mockTranslations },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
          preloadLangs: true,
        }),
      ],
    });

    const banner = screen.getByRole('banner');
    expect(banner).toBeTruthy();

    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' });
    expect(heading).toBeTruthy();
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('renders projected action buttons inside a toolbar landmark with accessible name', async () => {
    const user = userEvent.setup();
    let clicked = false;

    @Component({
      standalone: true,
      imports: [ManagerHeader],
      template: `
        <header app-manager-header headerTitle="inventory">
          <button type="button" (click)="handleClick()" aria-label="New Item">New Item</button>
        </header>
      `,
    })
    class ClickTestComponent {
      handleClick() {
        clicked = true;
      }
    }

    await render(ClickTestComponent, {
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: mockTranslations },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
          preloadLangs: true,
        }),
      ],
    });

    const toolbar = screen.getByRole('toolbar', { name: /actions/i });
    expect(toolbar).toBeTruthy();

    const actionBtn = screen.getByRole('button', { name: 'New Item' });
    expect(actionBtn).toBeTruthy();

    await user.click(actionBtn);
    expect(clicked).toBe(true);
  });
});
