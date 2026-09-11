import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  // ── Creation ────────────────────────────────────────────────────────────

  it('should be created', () => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    expect(service).toBeTruthy();
  });

  // ── Theme initialization ────────────────────────────────────────────────

  it('should initialize with browser dark preference when localStorage is empty', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should initialize with theme from localStorage when present', () => {
    localStorage.setItem('theme', 'dark');

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('should default to light theme when localStorage is empty and browser preference is not dark', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  // ── toggleTheme ─────────────────────────────────────────────────────────

  it('should toggle theme from light to dark', () => {
    localStorage.setItem('theme', 'light');

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    service.toggleTheme();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('should toggle theme from dark to light', () => {
    localStorage.setItem('theme', 'dark');

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    service.toggleTheme();

    expect(service.theme()).toBe('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
