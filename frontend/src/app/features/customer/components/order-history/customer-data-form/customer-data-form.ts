import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
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

  @Input() form!: FormGroup;

  @Output() submit = new EventEmitter<CustomerData>();

  setOrderType(type: OrderType) {
    this.form.get('type')?.setValue(type);
  }
  ngOnInit() {
    this.form.get('type')?.valueChanges.subscribe(() => {
      this.form.updateValueAndValidity();
    });
    this.form.valueChanges.subscribe(value => {
      localStorage.setItem('checkout_customer', JSON.stringify(value));
    });
  }
  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submit.emit(this.form.value);
  }
}