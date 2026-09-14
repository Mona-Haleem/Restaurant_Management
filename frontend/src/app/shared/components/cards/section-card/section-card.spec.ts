import { render, screen } from '@testing-library/angular';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  it('should render title and subtitle', async () => {
    await render(SectionCard, {
      inputs: {
        title: 'Main Title',
        subtitle: 'Sub Title',
      },
    });

    expect(screen.getByRole('heading', { level: 3, name: 'Main Title' })).toBeTruthy();
    expect(screen.getByText('Sub Title')).toBeTruthy();
  });

  it('should project content', async () => {
    await render(
      `<app-section-card title="Test Title"><div actions>Action Content</div><div>Main Content</div></app-section-card>`,
      {
        imports: [SectionCard],
      },
    );

    expect(screen.getByText('Action Content')).toBeTruthy();
    expect(screen.getByText('Main Content')).toBeTruthy();
  });
});
