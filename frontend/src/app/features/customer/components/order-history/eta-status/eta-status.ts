import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-eta-status',
  imports: [MatIconModule],
  templateUrl: './eta-status.html',
  styleUrl: './eta-status.scss',
})
export class EtaStatus {
  @Input() expectedPrepTime: number = 10;
  @Input() currentLoad: number = 12;
}
