import { render, screen } from '@testing-library/angular';
import { EtaStatus } from './eta-status';

describe('EtaStatus', () => {
  it('should render default values', async () => {
    await render(EtaStatus);

    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('should render provided inputs', async () => {
    await render(EtaStatus, {
      inputs: {
        expectedPrepTime: 25,
        currentLoad: 50,
      },
    });

    expect(screen.getByText('50')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
  });
});
