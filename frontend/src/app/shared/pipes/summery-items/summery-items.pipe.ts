import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'summeryItems',
})
export class SummeryItemsPipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): string {
    if (!value || (value as []).length == 0) return ''
    return (value as []).join(', ')
  }
}
