import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'summeryItems',
})
export class SummeryItemsPipe implements PipeTransform {
  transform(value: string[] | null | undefined, ...args: unknown[]): string {
    if (!value || value.length == 0) return '';
    value = value.filter((v) => v && v.trim().length > 0);
    let trailing = '';
    if (value.length > 3) {
      trailing = ` and ${value.length - 3} more.`;
      value = value.slice(0, 3);
    }
    return value.join(', ') + trailing;
  }
}
