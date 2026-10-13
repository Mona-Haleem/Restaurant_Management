import { Component, input } from '@angular/core';

@Component({
  selector: 'app-manager-header,header[app-manager-header]',
  imports: [],
  templateUrl: './manager-header.html',
  styleUrl: './manager-header.scss',
})
export class ManagerHeader {
  headerTitle = input.required<string>();
}
