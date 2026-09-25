import { render, screen } from '@testing-library/angular';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  describe('Default / Unknown Status', () => {
    it('should create without throwing when stageKey is empty', async () => {
      await render(StatusBadge);

      const badge = screen.getByRole('status');

      expect(badge).toBeTruthy();
      expect(badge.classList.contains('status-unknown')).toBe(true);
      expect(screen.getByText('Unknown')).toBeTruthy();
    });
  });

  describe('Phase 1 Default Config Stages', () => {
    it('should correctly render "pending" stage', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'pending',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-pending')).toBe(true);
      expect(screen.getByText('Pending')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon).toBeTruthy();
      expect(icon?.textContent?.trim()).toBe('schedule');
    });

    it('should correctly render "in-preparation" stage', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'in-preparation',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-in-preparation')).toBe(true);
      expect(screen.getByText('In Preparation')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon?.textContent?.trim()).toBe('soup_kitchen');
    });

    it('should correctly render "ready" stage', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'ready',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-ready')).toBe(true);
      expect(screen.getByText('Ready')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon?.textContent?.trim()).toBe('check_circle');
    });

    it('should correctly render "delivered" stage', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'delivered',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-delivered')).toBe(true);
      expect(screen.getByText('Delivered')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon?.textContent?.trim()).toBe('task_alt');
    });

    it('should support "preparing" as an alias for "in-preparation"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'preparing',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-in-preparation')).toBe(true);
      expect(screen.getByText('In Preparation')).toBeTruthy();
    });

    it('should support "completed" as an alias for "delivered"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'completed',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-delivered')).toBe(true);
      expect(screen.getByText('Delivered')).toBeTruthy();
    });
  });

  describe('Canceled & Low-Stock / Inventory Statuses', () => {
    it('should correctly render "cancelled"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'cancelled',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-cancelled')).toBe(true);

      const icon = badge.querySelector('.status-icon');

      expect(icon?.textContent?.trim()).toBe('cancel');
    });

    it('should correctly render "low-stock"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'low-stock',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-low-stock')).toBe(true);
      expect(screen.getByText('Low Stock')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon?.textContent?.trim()).toBe('warning');
    });

    it('should support "low_stock" as an alias', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'low_stock',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-low-stock')).toBe(true);
    });

    it('should correctly render "critical"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'critical',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-critical')).toBe(true);
    });

    it('should correctly render "out-of-stock"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'out-of-stock',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-out-of-stock')).toBe(true);
    });

    it('should correctly render "in-stock"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'in-stock',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-in-stock')).toBe(true);
    });

    it('should correctly render "derived"', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'derived',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-derived')).toBe(true);
    });
  });

  describe('Case Insensitivity and Delimiters', () => {
    it('should normalize uppercase stage keys', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'PENDING',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-pending')).toBe(true);
      expect(screen.getByText('Pending')).toBeTruthy();
    });

    it('should normalize snake_case stage keys', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'IN_PREPARATION',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-in-preparation')).toBe(true);
      expect(screen.getByText('In Preparation')).toBeTruthy();
    });

    it('should normalize uppercase snake_case stage keys', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'OUT_OF_STOCK',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-out-of-stock')).toBe(true);
    });
  });

  describe('Sensible Fallback for Unrecognized Keys', () => {
    it('should safely fall back for an unmapped stage key', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'quality-check',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-unknown')).toBe(true);
      expect(screen.getByText('quality check')).toBeTruthy();

      const icon = badge.querySelector('.status-icon');

      expect(icon).toBeTruthy();
      expect(icon?.textContent?.trim()).toBe('help_outline');
    });

    it('should handle null stageKey gracefully', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: null,
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-unknown')).toBe(true);
      expect(screen.getByText('Unknown')).toBeTruthy();
    });

    it('should handle whitespace stageKey gracefully', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: '   ',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge.classList.contains('status-unknown')).toBe(true);
      expect(screen.getByText('Unknown')).toBeTruthy();
    });
  });

  describe('Customization and Accessibility', () => {
    it('should allow overriding label text via label', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'pending',
          label: 'Awaiting Chef',
        },
      });

      const badge = screen.getByRole('status');

      expect(screen.getByText('Awaiting Chef')).toBeTruthy();
      expect(badge.textContent).toContain('Awaiting Chef');
    });

    it('should allow overriding icon via icon', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'pending',
          icon: 'bolt',
        },
      });

      const badge = screen.getByRole('status');
      const icon = badge.querySelector('.status-icon');

      expect(icon).toBeTruthy();
      expect(icon?.textContent?.trim()).toBe('bolt');
    });

    it('should hide the icon when showIcon is false', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'pending',
          showIcon: false,
        },
      });

      const badge = screen.getByRole('status');

      expect(screen.getByText('Pending')).toBeTruthy();
      expect(badge.querySelector('.status-icon')).toBeNull();
    });

    it('should have role="status" on the badge', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'ready',
        },
      });

      const badge = screen.getByRole('status');

      expect(badge).toBeTruthy();
    });

    it('should have aria-hidden="true" on the decorative icon', async () => {
      await render(StatusBadge, {
        inputs: {
          stageKey: 'ready',
        },
      });

      const badge = screen.getByRole('status');
      const icon = badge.querySelector('.status-icon');

      expect(icon).toBeTruthy();
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
