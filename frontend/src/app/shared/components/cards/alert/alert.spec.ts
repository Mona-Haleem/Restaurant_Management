import { Component } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Alert, AlertSeverity } from './alert';

@Component({
  imports: [Alert],
  template: `
    <section
      app-alert
      [severity]="severity"
      [title]="title"
      [description]="description"
      [metric]="metric"
      [meta]="meta"
      [badge]="badge"
      [icon]="icon"
      [collapsible]="collapsible"
      [(expanded)]="isExpanded"
      [explanation]="explanation"
      [skus]="skus"
      [actionLabel]="actionLabel"
    >
      <button actions class="custom-action">Investigate</button>
      <button secondary-actions class="cctv-btn">CCTV Logs</button>
      <button primary-action class="ack-btn">Acknowledge</button>
      <div class="custom-body">Extra Alert Body</div>
    </section>
  `,
})
class TestAlertHostComponent {
  severity: AlertSeverity = 'critical';
  title = 'Excessive Dough & EVOO Deduction Anomaly';
  description = 'Over-portioning or unlogged bottle damage suspected.';
  metric = 'Ingredient depletion 3.2× recipe standard expectation during dinner rush.';
  meta = 'Oct 24, 19:45 · Wood Hearth Station #02';
  badge?: string;
  icon?: string;
  collapsible = true;
  isExpanded = false;
  explanation = 'POS processed 42 Truffle Flatbread orders.';
  skus = ['SKU: RAW-9814 (EVOO)', 'SKU: RAW-1102 (Dough)'];
  actionLabel?: string;
}

describe('Alert (AlertCard)', () => {
  it('should render title, description, meta, and metric with default critical badge and icon', async () => {
    await render(TestAlertHostComponent);

    expect(screen.getByRole('heading', { level: 3, name: /excessive dough & evoo/i })).toBeTruthy();
    expect(screen.getByText('HIGH CRITICAL')).toBeTruthy();
    expect(screen.getByText('error')).toBeTruthy();
    expect(screen.getByText('Oct 24, 19:45 · Wood Hearth Station #02')).toBeTruthy();
    expect(screen.getByText(/Ingredient depletion 3.2×/i)).toBeTruthy();
  });

  it('should render appropriate default badge and icon for medium severity', async () => {
    await render(TestAlertHostComponent, {
      componentProperties: {
        severity: 'medium',
        title: 'Medium Severity Alert',
      },
    });

    expect(screen.getByText('MEDIUM SEVERITY')).toBeTruthy();
    expect(screen.getByText('flag')).toBeTruthy();
  });

  it('should render appropriate default badge and icon for audit severity', async () => {
    await render(TestAlertHostComponent, {
      componentProperties: {
        severity: 'audit',
        title: 'Audit Warning Alert',
      },
    });

    expect(screen.getByText('AUDIT WARNING')).toBeTruthy();
    expect(screen.getByText('assignment')).toBeTruthy();
  });

  it('should allow overriding badge and icon inputs', async () => {
    await render(TestAlertHostComponent, {
      componentProperties: {
        badge: 'CUSTOM STATUS',
        icon: 'notifications_active',
      },
    });

    expect(screen.getByText('CUSTOM STATUS')).toBeTruthy();
    expect(screen.getByText('notifications_active')).toBeTruthy();
  });

  it('should handle collapsible state: expand and collapse on toggle button click', async () => {
    const user = userEvent.setup();
    const { fixture } = await render(TestAlertHostComponent, {
      componentProperties: {
        collapsible: true,
        isExpanded: false,
      },
    });

    const host = fixture.componentInstance;
    expect(host.isExpanded).toBe(false);

    // Initial state: details box is collapsed
    expect(screen.queryByText(/POS processed 42 Truffle Flatbread orders/i)).toBeNull();

    const toggleButton = screen.getByRole('button', { name: /expand log/i });
    expect(toggleButton.getAttribute('aria-expanded')).toBe('false');

    // Click to expand
    await user.click(toggleButton);
    expect(host.isExpanded).toBe(true);
    expect(screen.getByText(/POS processed 42 Truffle Flatbread orders/i)).toBeTruthy();
    expect(screen.getByText('SKU: RAW-9814 (EVOO)')).toBeTruthy();
    expect(screen.getByText('SKU: RAW-1102 (Dough)')).toBeTruthy();

    // Click to collapse
    const collapseButton = screen.getByRole('button', { name: /collapse log/i });
    expect(collapseButton.getAttribute('aria-expanded')).toBe('true');
    await user.click(collapseButton);

    expect(host.isExpanded).toBe(false);
    expect(screen.queryByText(/POS processed 42 Truffle Flatbread orders/i)).toBeNull();
  });

  it('should not show collapsible toggle button when collapsible is false', async () => {
    await render(TestAlertHostComponent, {
      componentProperties: {
        collapsible: false,
      },
    });

    expect(screen.queryByRole('button', { name: /expand log/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /collapse log/i })).toBeNull();
  });

  it('should render actionLabel button when provided', async () => {
    await render(
      `<section app-alert title="Quick Alert" actionLabel="Reconcile Count"></section>`,
      {
        imports: [Alert],
      },
    );

    expect(screen.getByRole('button', { name: 'Reconcile Count' })).toBeTruthy();
  });

  it('should project actions, secondary-actions, primary-action, and body content', async () => {
    const user = userEvent.setup();
    await render(TestAlertHostComponent, {
      componentProperties: {
        collapsible: true,
        isExpanded: false,
      },
    });

    // In collapsed state, [actions] is visible
    expect(screen.getByRole('button', { name: 'Investigate' })).toBeTruthy();

    // Expand
    await user.click(screen.getByRole('button', { name: /expand log/i }));

    // In expanded state, [secondary-actions], [primary-action], and body are rendered
    expect(screen.getByRole('button', { name: 'CCTV Logs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeTruthy();
    expect(screen.getByText('Extra Alert Body')).toBeTruthy();
  });
});
