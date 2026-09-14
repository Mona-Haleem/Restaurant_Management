import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BtnToggleGroup } from './btn-toggle-group';

describe('BtnToggleGroup', () => {
  const defaultOptions = [
    { text: 'Delivery', icon: 'local_shipping' },
    { text: 'Dine In' },
    { text: 'Takeaway', icon: 'shopping_bag' },
  ];

  it('it should correctly render the provided options with icons if required', async () => {
    await render(BtnToggleGroup, {
      inputs: {
        options: defaultOptions,
        selected: 'Delivery',
      },
    });

    const group = screen.getByRole('group');
    expect(group).toBeTruthy();

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);

    const deliveryBtn = screen.getByRole('button', { name: 'Delivery' });
    const dineInBtn = screen.getByRole('button', { name: 'Dine In' });
    const takeawayBtn = screen.getByRole('button', { name: 'Takeaway' });

    expect(deliveryBtn).toBeTruthy();
    expect(dineInBtn).toBeTruthy();
    expect(takeawayBtn).toBeTruthy();

    // Verify icons are present for options with icons and have aria-hidden="true"
    const deliveryIcon = deliveryBtn.querySelector('mat-icon');
    expect(deliveryIcon).toBeTruthy();
    expect(deliveryIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(deliveryIcon?.textContent?.trim()).toBe('local_shipping');

    const takeawayIcon = takeawayBtn.querySelector('mat-icon');
    expect(takeawayIcon).toBeTruthy();
    expect(takeawayIcon?.getAttribute('aria-hidden')).toBe('true');
    expect(takeawayIcon?.textContent?.trim()).toBe('shopping_bag');

    // Dine In has no icon
    const dineInIcon = dineInBtn.querySelector('mat-icon');
    expect(dineInIcon).toBeNull();
  });

  it('it should have an item selected', async () => {
    await render(BtnToggleGroup, {
      inputs: {
        options: defaultOptions,
        selected: 'Delivery',
      },
    });

    const deliveryBtn = screen.getByRole('button', { name: 'Delivery' });
    const dineInBtn = screen.getByRole('button', { name: 'Dine In' });
    const takeawayBtn = screen.getByRole('button', { name: 'Takeaway' });

    expect(deliveryBtn.getAttribute('aria-pressed')).toBe('true');
    expect(dineInBtn.getAttribute('aria-pressed')).toBe('false');
    expect(takeawayBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the btn change the selected item', async () => {
    const user = userEvent.setup();
    await render(BtnToggleGroup, {
      inputs: {
        options: defaultOptions,
        selected: 'Delivery',
      },
    });

    const deliveryBtn = screen.getByRole('button', { name: 'Delivery' });
    const dineInBtn = screen.getByRole('button', { name: 'Dine In' });

    expect(deliveryBtn.getAttribute('aria-pressed')).toBe('true');
    expect(dineInBtn.getAttribute('aria-pressed')).toBe('false');

    await user.click(dineInBtn);

    expect(dineInBtn.getAttribute('aria-pressed')).toBe('true');
    expect(deliveryBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the btn should also fire the ontoggle function if provided', async () => {
    const user = userEvent.setup();
    const onToggleSpy = vi.fn();

    await render(BtnToggleGroup, {
      inputs: {
        options: defaultOptions,
        selected: 'Delivery',
        onToggle: onToggleSpy,
      },
    });

    const dineInBtn = screen.getByRole('button', { name: 'Dine In' });
    await user.click(dineInBtn);

    expect(onToggleSpy).toHaveBeenCalledTimes(1);
    expect(onToggleSpy).toHaveBeenCalledWith('Dine In');
  });

  it('clicking the btn should fire onToggle function if provided', async () => {
    const user = userEvent.setup();
    const onToggleSpy = vi.fn();

    await render(BtnToggleGroup, {
      inputs: {
        options: defaultOptions,
        selected: 'Delivery',
        onToggle: onToggleSpy,
      },
    });

    const takeawayBtn = screen.getByRole('button', { name: 'Takeaway' });
    await user.click(takeawayBtn);

    expect(onToggleSpy).toHaveBeenCalledTimes(1);
    expect(onToggleSpy).toHaveBeenCalledWith('Takeaway');
  });
});
