import { MatIcon } from '@angular/material/icon';
import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  describe('section content rendering', () => {
    it('should render title, subtitle, highlight, and title/highlight icons', async () => {
      await render(
        `
        <section
          app-section-card
          title="Wood-Fired Mains"
          subtitle="Prepared upon order"
          highlight="Specialty"
          highlightIcon="star"
          titleIcon="restaurant"
        ></section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      expect(screen.getByRole('heading', { level: 3, name: /wood-fired mains/i })).toBeTruthy();
      expect(screen.getByText('Prepared upon order')).toBeTruthy();
      expect(screen.getByText('Specialty')).toBeTruthy();
      expect(screen.getByText('star')).toBeTruthy();
      expect(screen.getByText('restaurant')).toBeTruthy();
    });
  });

  describe('icon handling', () => {
    it('should render icon container when icon is provided through icon input', async () => {
      const { container } = await render(
        `<section app-section-card title="Payment Method" icon="cloud"></section>`,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const mainIconContainer = container.querySelector('.main-icon');
      expect(mainIconContainer).toBeTruthy();
      expect(screen.getByText('cloud')).toBeTruthy();
    });

    it('should render icon container when icon is provided through projected [icon]', async () => {
      const { container } = await render(
        `
        <section app-section-card title="Order Summary">
          <mat-icon icon #icon class="custom-icon">menu</mat-icon>
        </section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const mainIconContainer = container.querySelector('.main-icon');
      expect(mainIconContainer).toBeTruthy();
      expect(screen.getByText('menu')).toBeTruthy();
    });

    it('should not render icon container when no icon is provided', async () => {
      const { container } = await render(
        `<section app-section-card title="No Icon Card"></section>`,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      expect(container.querySelector('.main-icon')).toBeNull();
    });
  });

  describe('additional content projection', () => {
    it('should project [badge] into title', async () => {
      await render(
        `
        <section app-section-card title="Sandbox">
          <span badge class="test-badge">Phase 1</span>
        </section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading.querySelector('.test-badge')).toBeTruthy();
      expect(screen.getByText('Phase 1')).toBeTruthy();
    });

    it('should project [actions] into header', async () => {
      const { container } = await render(
        `
        <section app-section-card title="Orders">
          <div actions class="header-actions">
            <button type="button">Refresh</button>
          </div>
        </section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const header = container.querySelector('header');
      expect(header?.querySelector('.header-actions')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    });

    it('should project normal body content into article', async () => {
      const { container } = await render(
        `
        <section app-section-card title="Card Title">
          <p class="body-content">Main card body content</p>
        </section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const article = container.querySelector('article');
      expect(article?.querySelector('.body-content')).toBeTruthy();
      expect(screen.getByText('Main card body content')).toBeTruthy();
    });
  });

  describe('appearance configuration', () => {
    it('should apply configured size classes to title, subtitle, and highlight', async () => {
      await render(
        `
        <section
          app-section-card
          title="Custom Size Title"
          subtitle="Custom Subtitle"
          highlight="Custom Highlight"
          [size]="{ title: 'text-h1', subtitle: 'text-body', highlight: 'text-caption' }"
        ></section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading.classList.contains('text-h1')).toBe(true);

      const subtitle = screen.getByText('Custom Subtitle');
      expect(subtitle.classList.contains('text-body')).toBe(true);

      const highlight = screen.getByText('Custom Highlight');
      expect(highlight.classList.contains('text-caption')).toBe(true);
    });

    it('should apply transparent class to header when transparentHeader is true', async () => {
      const { container } = await render(
        `
        <section
          app-section-card
          title="Transparent Card"
          [transparentHeader]="true"
        ></section>
        `,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const header = container.querySelector('header');
      expect(header?.classList.contains('transparent')).toBe(true);
    });

    it('should not apply transparent class to header when transparentHeader is false or default', async () => {
      const { container } = await render(
        `<section app-section-card title="Default Header Card"></section>`,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      const header = container.querySelector('header');
      expect(header?.classList.contains('transparent')).toBe(false);
    });
  });

  describe('optional content handling', () => {
    it('should not produce unwanted elements when subtitle, highlight, and icons are omitted', async () => {
      const { container } = await render(
        `<section app-section-card title="Minimal Card"></section>`,
        {
          imports: [SectionCard, MatIcon],
        },
      );

      expect(screen.getByRole('heading', { level: 3, name: 'Minimal Card' })).toBeTruthy();
      expect(container.querySelector('.main-icon')).toBeNull();
      expect(container.querySelector('.highlight')).toBeNull();
      expect(container.querySelector('.text-caption')).toBeNull();
      expect(container.querySelector('mat-icon')).toBeNull();
    });
  });
});
