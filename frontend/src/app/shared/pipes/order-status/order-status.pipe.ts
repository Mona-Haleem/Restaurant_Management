import { Pipe, PipeTransform } from '@angular/core';
import { OrderStatus, OrderStatusList, statusIcons } from '../../../core/models';

@Pipe({
  name: 'orderStatus',
})
export class OrderStatusPipe implements PipeTransform {
  transform(value: string, format: 'css' | 'label' | 'icon' = 'label'): string {
    if (!value || !OrderStatusList.includes(value as OrderStatus)) return value;
    if (format === 'css') return 'status-' + value.toLowerCase().replaceAll('_', '-');
    if (format === 'icon') return statusIcons[value as OrderStatus] || 'help';
    return value
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
