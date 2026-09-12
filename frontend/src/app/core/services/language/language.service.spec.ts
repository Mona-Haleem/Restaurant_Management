import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';
import { TranslocoService } from '@jsverse/transloco';

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
    document.documentElement.removeAttribute('dir');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslocoService,
          useValue: {
            setActiveLang: (lang: string) => lang,
          },
        },
      ],
    });
  });

  // ── Creation ────────────────────────────────────────────────────────────

  it('should be created', () => {
    service = TestBed.inject(LanguageService);

    expect(service).toBeTruthy();
  });

  // ── Language initialization ─────────────────────────────────────────────

  it('should default to english when localStorage is empty', () => {
    service = TestBed.inject(LanguageService);

    expect(service.language()).toBe('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  it('should initialize with language from localStorage when present', () => {
    localStorage.setItem('language', 'ar');

    service = TestBed.inject(LanguageService);

    expect(service.language()).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('should ignore invalid localStorage value and default to english', () => {
    localStorage.setItem('language', 'fr');

    service = TestBed.inject(LanguageService);

    expect(service.language()).toBe('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
  });

  // ── setLanguage ─────────────────────────────────────────────────────────

  it('should set language to arabic and update DOM', () => {
    service = TestBed.inject(LanguageService);

    service.setLanguage('ar');

    expect(service.language()).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(localStorage.getItem('language')).toBe('ar');
  });

  it('should set language to english and update DOM', () => {
    localStorage.setItem('language', 'ar');

    service = TestBed.inject(LanguageService);

    service.setLanguage('en');

    expect(service.language()).toBe('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(localStorage.getItem('language')).toBe('en');
  });

  // ── toggleLanguage ──────────────────────────────────────────────────────

  it('should toggle language from english to arabic', () => {
    service = TestBed.inject(LanguageService);

    service.toggleLanguage();

    expect(service.language()).toBe('ar');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(localStorage.getItem('language')).toBe('ar');
  });

  it('should toggle language from arabic to english', () => {
    localStorage.setItem('language', 'ar');

    service = TestBed.inject(LanguageService);

    service.toggleLanguage();

    expect(service.language()).toBe('en');
    expect(document.documentElement.getAttribute('lang')).toBe('en');
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(localStorage.getItem('language')).toBe('en');
  });
});
