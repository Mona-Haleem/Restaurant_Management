import { Component, effect, inject, input, output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { CustomerData, OrderType } from '../../../../../core/models';
import { MatIcon } from '@angular/material/icon';
import { SectionCard } from '../../../../../shared/components/section-card/section-card';

@Component({
  selector: 'app-customer-data-form',
  imports: [MatIcon, ReactiveFormsModule, SectionCard],
  templateUrl: './customer-data-form.html',
  styleUrl: './customer-data-form.scss',
})
export class CustomerDataForm {
  form = input.required<FormGroup>();

  submit = output<CustomerData>();

  constructor() {
    effect((onCleanup) => {
      const typeSub = this.form()
        .get('type')
        ?.valueChanges.subscribe(() => {
          this.form().updateValueAndValidity();
        });
      const valSub = this.form().valueChanges.subscribe((value) => {
        localStorage.setItem('checkout_customer', JSON.stringify(value));
      });
      onCleanup(() => {
        typeSub?.unsubscribe();
        valSub?.unsubscribe();
      });
    });
  }

  setOrderType(type: OrderType) {
    this.form().get('type')?.setValue(type);
  }

  onSubmit() {
    if (this.form().invalid) {
      this.form().markAllAsTouched();
      return;
    }

    this.submit.emit(this.form().value);
  }
}
