import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StepperBtn } from './stepper-btn';

describe('StepperBtn', () => {
  it('it should accept a numeric value and correctly render it', async () => {
    await render(StepperBtn, {
      inputs: {
        value: 10,
        label: 'Quantity',
      },
    });

    const group = screen.getByRole('group', { name: 'Quantity' });
    expect(group).toBeTruthy();

    const spinbutton = screen.getByRole('spinbutton', { name: 'Quantity' }) as HTMLInputElement;
    expect(spinbutton).toBeTruthy();
    expect(spinbutton.value).toBe('10');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('10');

    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Quantity' });
    const increaseBtn = screen.getByRole('button', { name: 'Increase Quantity' });
    expect(decreaseBtn).toBeTruthy();
    expect(increaseBtn).toBeTruthy();
  });

  it('decrease and increase btn should correctly update the value (expect new value to be found)', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 5,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' });
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' });

    expect(spinbutton.value).toBe('5');

    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('6');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('6');

    await user.click(decreaseBtn);
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('4');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('4');
  });

  it('user can enter value directly inside the input', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 0,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;

    await user.clear(spinbutton);
    await user.type(spinbutton, '42');
    await user.tab();

    expect(spinbutton.value).toBe('42');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('42');
  });

  it('a text or non numeric value should never enter the input', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 10,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;

    await user.type(spinbutton, 'abc');
    expect(spinbutton.value).toBe('10');

    await user.type(spinbutton, '!@#$%^&*');
    expect(spinbutton.value).toBe('10');
  });

  it('it should be possible to set a max and min value and value should never exced them no matter how you updates with btns or directly write it', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        min: 2,
        max: 5,
        value: 4,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' }) as HTMLButtonElement;
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' }) as HTMLButtonElement;

    expect(spinbutton.getAttribute('aria-valuemin')).toBe('2');
    expect(spinbutton.getAttribute('aria-valuemax')).toBe('5');

    // Update with increase button up to max
    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('5');
    expect(increaseBtn.disabled).toBe(true);

    // Clicking again while at max should not exceed
    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('5');

    // Try to directly write a value exceeding max
    await user.clear(spinbutton);
    await user.type(spinbutton, '99');
    await user.tab();
    expect(spinbutton.value).toBe('5');

    // Decrease down to min
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('4');
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('3');
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('2');
    expect(decreaseBtn.disabled).toBe(true);

    // Clicking again while at min should not exceed
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('2');

    // Try to directly write a value below min
    await user.clear(spinbutton);
    await user.type(spinbutton, '0');
    await user.tab();
    expect(spinbutton.value).toBe('2');
  });

  it('if step provided btns must follow the steps', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 10,
        step: 5,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' });
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' });

    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('15');

    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('10');

    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('5');
  });

  it('if no min max step it should be possible to enter negative value or any large number and step will always be 1', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 0,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' });
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' });

    expect(spinbutton.getAttribute('aria-valuemin')).toBeNull();
    expect(spinbutton.getAttribute('aria-valuemax')).toBeNull();

    // Can decrement into negative numbers
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('-1');

    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('-2');

    // Can directly enter negative numbers
    await user.clear(spinbutton);
    await user.type(spinbutton, '-50');
    await user.tab();
    expect(spinbutton.value).toBe('-50');

    // Can enter any large number
    await user.clear(spinbutton);
    await user.type(spinbutton, '1000000');
    await user.tab();
    expect(spinbutton.value).toBe('1000000');

    // Step is always 1 by default
    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('1000001');
  });

  it('it should handle extra large numbers correctly', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 1000000,
        step: 50000,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' });
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' });

    expect(spinbutton.value).toBe('1000000');

    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('1050000');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('1050000');

    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('1000000');

    // Directly enter an extra large number
    await user.clear(spinbutton);
    await user.type(spinbutton, '9999999');
    await user.tab();
    expect(spinbutton.value).toBe('9999999');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('9999999');

    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('10049999');
  });

  it('should handle decimal steps and values correctly', async () => {
    const user = userEvent.setup();
    await render(StepperBtn, {
      inputs: {
        value: 0.1,
        step: 0.2,
        label: 'Items',
      },
    });

    const spinbutton = screen.getByRole('spinbutton', { name: 'Items' }) as HTMLInputElement;
    const increaseBtn = screen.getByRole('button', { name: 'Increase Items' });
    const decreaseBtn = screen.getByRole('button', { name: 'Decrease Items' });

    expect(spinbutton.value).toBe('0.1');
    expect(spinbutton.getAttribute('step')).toBe('0.2');

    // Increment with decimal step avoiding floating point issues (0.1 + 0.2 = 0.3)
    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('0.3');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('0.3');

    // Decrement with decimal step
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('0.1');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('0.1');

    // Decrement into negative decimals
    await user.click(decreaseBtn);
    expect(spinbutton.value).toBe('-0.1');

    // Directly type a decimal value
    await user.clear(spinbutton);
    await user.type(spinbutton, '2.75');
    await user.tab();
    expect(spinbutton.value).toBe('2.75');
    expect(spinbutton.getAttribute('aria-valuenow')).toBe('2.75');

    // Increment after typing decimal
    await user.click(increaseBtn);
    expect(spinbutton.value).toBe('2.95');
  });
});
