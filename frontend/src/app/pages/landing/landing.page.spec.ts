import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { LandingPage } from './landing.page';

describe('LandingPage', () => {
  let fixture: ComponentFixture<LandingPage>;
  let component: LandingPage;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingPage],
      providers: [
        provideRouter([
          { path: 'customer', children: [] },
          { path: 'worker', children: [] },
          { path: 'manager', children: [] },
        ]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should create the page', () => {
    expect(component).toBeTruthy();
  });

  it('should render three navigation links for the different roles', () => {
    const links = fixture.debugElement.queryAll(By.css('a'));
    expect(links.length).toBeGreaterThanOrEqual(3);

    const hrefs = links.map((l) => l.nativeElement.getAttribute('href'));

    // Angular routerLink generates href attributes automatically
    expect(hrefs.some((h) => h.includes('/customer'))).toBe(true);
    expect(hrefs.some((h) => h.includes('/worker'))).toBe(true);
    expect(hrefs.some((h) => h.includes('/manager'))).toBe(true);
  });
});
