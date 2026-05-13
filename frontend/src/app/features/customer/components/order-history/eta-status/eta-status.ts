import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-eta-status',
  imports: [MatIconModule],
  templateUrl: './eta-status.html',
  styleUrl: './eta-status.scss',
})
export class EtaStatus {
  expectedPrepTime: number = 10;
  currentLoad: number = 12;
}
