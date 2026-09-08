import { render, screen, fireEvent } from '@testing-library/angular';
import { CustomerDataForm } from './customer-data-form';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { FormBuilder, Validators } from '@angular/forms';

describe('CustomerDataForm', () => {
  const fb = new FormBuilder();

  function createForm() {
    return fb.group({
      fullName: ['', Validators.required],
      phone: ['', Validators.required],
      type: ['dine-in', Validators.required],
      location: [''],
    });
  }

  it('should render and default to "dine-in" showing table number', async () => {
    await render(CustomerDataForm, {
      inputs: { form: createForm() },
    });

    expect(screen.getByPlaceholderText(/full name/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/\+2 01xxxxxxxxx/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/table number/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/delivery address/i)).toBeFalsy();
  });

  it('should switch to delivery and show delivery address', async () => {
    const user = userEvent.setup();
    await render(CustomerDataForm, {
      inputs: { form: createForm() },
    });

    const deliveryBox = screen.getByText('Delivery');
    await user.click(deliveryBox);

    expect(screen.queryByPlaceholderText(/table number/i)).toBeFalsy();
    expect(screen.getByPlaceholderText(/delivery address/i)).toBeTruthy();
  });

  it('should switch to pickup and hide both location inputs', async () => {
    const user = userEvent.setup();
    await render(CustomerDataForm, {
      inputs: { form: createForm() },
    });

    const pickupBox = screen.getByText('Pickup');
    await user.click(pickupBox);

    expect(screen.queryByPlaceholderText(/table number/i)).toBeFalsy();
    expect(screen.queryByPlaceholderText(/delivery address/i)).toBeFalsy();
  });

  it('should emit form data on submit when valid', async () => {
    const user = userEvent.setup();
    const submitSpy = vi.fn();
    const form = createForm();

    const { container } = await render(CustomerDataForm, {
      inputs: { form },
      on: { submit: submitSpy },
    });

    await user.type(screen.getByPlaceholderText(/full name/i), 'John Doe');
    await user.type(screen.getByPlaceholderText(/\+2 01xxxxxxxxx/i), '1234567890');

    await user.click(screen.getByText('Delivery'));
    await user.type(screen.getByPlaceholderText(/delivery address/i), '123 Main St');

    // Submit form
    fireEvent.submit(container.querySelector('form')!);

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'John Doe',
        phone: '1234567890',
        type: 'delivery',
        location: '123 Main St',
      }),
    );
  });

  it('should not emit if form is invalid', async () => {
    const submitSpy = vi.fn();
    const form = createForm();

    const { container } = await render(CustomerDataForm, {
      inputs: { form },
      on: { submit: submitSpy },
    });

    fireEvent.submit(container.querySelector('form')!);

    expect(submitSpy).not.toHaveBeenCalled();
  });
});
