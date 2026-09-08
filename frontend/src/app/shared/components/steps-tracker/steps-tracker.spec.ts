import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { StepsTracker } from './steps-tracker';
import { vi } from 'vitest';

describe('StepsTracker', () => {
  const steps = [
    { isIcon: false, label: 'Step 1', icon: '1', isLocked: false },
    { isIcon: false, label: 'Step 2', icon: '2', isLocked: false },
    { isIcon: false, label: 'Step 3', icon: '3', isLocked: true },
  ];

  it('should render step labels', async () => {
    await render(StepsTracker, {
      inputs: { steps, currentStep: 0 },
    });

    expect(screen.getByText('Step 1')).toBeTruthy();
    expect(screen.getByText('Step 2')).toBeTruthy();
    expect(screen.getByText('Step 3')).toBeTruthy();
  });

  it('should calculate progress width correctly', async () => {
    await render(StepsTracker, {
      inputs: { steps, currentStep: 1 },
    });

    const progressBar = screen.getByTestId('progress-bar');
    expect(progressBar.style.width).toBe('50%');
  });

  it('should fire event when clicking unlocked step', async () => {
    const currentStepChange = vi.fn();
    const user = userEvent.setup();
    await render(StepsTracker, {
      inputs: { steps, currentStep: 0 },
      on: { currentStepChange },
    });

    const step2 = screen.getByText('Step 2');
    await user.click(step2);

    expect(currentStepChange).toHaveBeenCalledWith(1);
  });

  it('should NOT fire event when clicking locked step', async () => {
    const currentStepChange = vi.fn();
    const user = userEvent.setup();
    await render(StepsTracker, {
      inputs: { steps, currentStep: 0 },
      on: { currentStepChange },
    });

    const step3 = screen.getByText('Step 3');
    await user.click(step3);

    expect(currentStepChange).not.toHaveBeenCalled();
  });
});
