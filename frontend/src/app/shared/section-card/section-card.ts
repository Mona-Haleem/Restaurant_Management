import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-section-card',
  imports: [],
  templateUrl: './section-card.html',
  styleUrl: './section-card.scss',
})
export class SectionCard {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
}
