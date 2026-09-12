import { Component, signal } from '@angular/core';
//import { RouterOutlet } from '@angular/router';
//import { NavBar } from './shared/components/nav-bar/nav-bar';
//import { StyleTest } from './temp/style-test/style-test';
//import { LanguageService } from './core/services/language/language.service';

@Component({
  selector: 'app-root',
  imports: [], //StyleTest , RouterOutlet , NavBar],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('frontend');
  //protected readonly languageService = inject(LanguageService);
}
