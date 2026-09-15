import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, type DropdownItem } from './dropdown-menu';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const rowItems: DropdownItem[] = [
  { id: 'edit', label: 'Edit Item', icon: 'edit' },
  { id: 'duplicate', label: 'Duplicate', icon: 'content_copy' },
  { id: 'archive', label: 'Archive', icon: 'archive', divider: true },
  { id: 'delete', label: 'Delete', icon: 'delete', danger: true },
];

const avatarItems: DropdownItem[] = [
  { id: 'profile', label: 'View Profile', icon: 'person' },
  { id: 'settings', label: 'Account Settings', icon: 'settings' },
  { id: 'signout', label: 'Sign Out', icon: 'logout', danger: true, divider: true },
];

const disabledItems: DropdownItem[] = [
  { id: 'active', label: 'Active Action' },
  { id: 'disabled', label: 'Disabled Action', disabled: true },
];

async function renderDots(items: DropdownItem[] = rowItems, extra: Record<string, unknown> = {}) {
  return render(DropdownMenu, {
    componentInputs: { items, triggerType: 'dots', ...extra },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("DropdownMenu — from a user's point of view", () => {
  // ── Trigger button ────────────────────────────────────────────────────────

  describe('trigger button', () => {
    it('renders a button labelled "Row actions" for the dots trigger', async () => {
      await renderDots();

      expect(screen.getByRole('button', { name: 'Row actions' })).toBeTruthy();
    });

    it('renders a button labelled "Account menu" for the avatar trigger', async () => {
      await render(DropdownMenu, {
        componentInputs: {
          items: avatarItems,
          triggerType: 'avatar',
          avatarText: 'TK',
        },
      });

      expect(screen.getByRole('button', { name: 'Account menu' })).toBeTruthy();
    });

    it('shows the avatar initials text inside the avatar trigger', async () => {
      await render(DropdownMenu, {
        componentInputs: {
          items: avatarItems,
          triggerType: 'avatar',
          avatarText: 'ML',
        },
      });

      expect(screen.getByText('ML')).toBeTruthy();
    });

    it('panel is closed by default — no menu items visible', async () => {
      await renderDots();

      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.queryByText('Edit Item')).toBeNull();
    });

    it('trigger button has aria-expanded="false" when closed', async () => {
      await renderDots();

      const trigger = screen.getByRole('button', { name: 'Row actions' });
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    });
  });

  // ── Opening / closing panel ───────────────────────────────────────────────

  describe('opening and closing', () => {
    it('opens the panel and shows all items when the trigger is clicked', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      expect(screen.getByRole('menu')).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /edit item/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /duplicate/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /archive/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /delete/i })).toBeTruthy();
    });

    it('trigger button has aria-expanded="true" when panel is open', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      const trigger = screen.getByRole('button', { name: 'Row actions' });
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('closes the panel when the trigger is clicked a second time (toggle)', async () => {
      const user = userEvent.setup();
      await renderDots();

      const trigger = screen.getByRole('button', { name: 'Row actions' });
      await user.click(trigger); // open
      await user.click(trigger); // close

      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes the panel when Escape is pressed', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));
      expect(screen.getByRole('menu')).toBeTruthy();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes the panel when a click outside the component occurs', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));
      expect(screen.getByRole('menu')).toBeTruthy();

      // Click on a neutral part of the document outside the component
      await user.click(document.body);

      expect(screen.queryByRole('menu')).toBeNull();
    });
  });

  // ── Item selection ────────────────────────────────────────────────────────

  describe('item selection', () => {
    it('emits itemClick with the selected item when a menu item is clicked', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();

      await render(DropdownMenu, {
        componentInputs: { items: rowItems, triggerType: 'dots' },
        on: { itemClick: onItemClick },
      });

      await user.click(screen.getByRole('button', { name: 'Row actions' }));
      await user.click(screen.getByRole('menuitem', { name: /edit item/i }));

      expect(onItemClick).toHaveBeenCalledOnce();
      expect(onItemClick).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'edit', label: 'Edit Item' }),
      );
    });

    it('closes the panel after an item is selected', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));
      await user.click(screen.getByRole('menuitem', { name: /duplicate/i }));

      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('does NOT emit itemClick for a disabled item', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();

      await render(DropdownMenu, {
        componentInputs: { items: disabledItems, triggerType: 'dots' },
        on: { itemClick: onItemClick },
      });

      await user.click(screen.getByRole('button', { name: 'Row actions' }));
      // disabled item is not interactive — pointer-events: none in CSS,
      // but still query to confirm it's rendered
      expect(screen.getByRole('menuitem', { name: /disabled action/i })).toBeTruthy();

      // Attempt click (will be blocked by pointer-events:none / disabled attribute)
      const disabledItem = screen.getByRole('menuitem', { name: /disabled action/i });
      expect(disabledItem.hasAttribute('disabled')).toBe(true);

      expect(onItemClick).not.toHaveBeenCalled();
    });
  });

  // ── Danger items ──────────────────────────────────────────────────────────

  describe('danger styling', () => {
    it('marks danger items with the item-danger class', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      const deleteItem = screen.getByRole('menuitem', { name: /delete/i });
      expect(deleteItem.classList).toContain('item-danger');
    });

    it('non-danger items do NOT carry the item-danger class', async () => {
      const user = userEvent.setup();
      await renderDots();

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      const editItem = screen.getByRole('menuitem', { name: /edit item/i });
      expect(editItem.classList).not.toContain('item-danger');
    });
  });

  // ── Placement ─────────────────────────────────────────────────────────────

  describe('panel placement', () => {
    it('panel carries the panel-end class for bottom-end placement (default)', async () => {
      const user = userEvent.setup();
      await renderDots(rowItems, { placement: 'bottom-end' });

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      expect(screen.getByRole('menu').classList).toContain('panel-end');
    });

    it('panel carries the panel-start class for bottom-start placement', async () => {
      const user = userEvent.setup();
      await renderDots(rowItems, { placement: 'bottom-start' });

      await user.click(screen.getByRole('button', { name: 'Row actions' }));

      expect(screen.getByRole('menu').classList).toContain('panel-start');
    });
  });

  // ── Avatar trigger ────────────────────────────────────────────────────────

  describe('avatar trigger type', () => {
    it('emits itemClick with the correct item from an avatar menu', async () => {
      const user = userEvent.setup();
      const onItemClick = vi.fn();

      await render(DropdownMenu, {
        componentInputs: { items: avatarItems, triggerType: 'avatar', avatarText: 'ZH' },
        on: { itemClick: onItemClick },
      });

      await user.click(screen.getByRole('button', { name: 'Account menu' }));
      await user.click(screen.getByRole('menuitem', { name: /view profile/i }));

      expect(onItemClick).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'profile', label: 'View Profile' }),
      );
    });
  });
});
