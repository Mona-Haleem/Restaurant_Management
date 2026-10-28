import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Meta, MetaDefinition, Title } from '@angular/platform-browser';
import { ErrorStateService } from '../../../core/services/error-state/error-state.service';

@Component({
  selector: 'app-unauthorized',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './unauthorized.html',
  styleUrl: './unauthorized.scss',
})
export class Unauthorized implements OnInit {
  private readonly location = inject(Location);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly transloco = inject(TranslocoService);
  private readonly errorState = inject(ErrorStateService);

  ngOnInit(): void {
    this.pageTitle.setTitle(this.transloco.translate('errors.unauthorized.pageTitle'));
    this.meta.updateTag({
      name: 'description',
      content: this.transloco.translate('errors.unauthorized.metaDescription'),
    } as MetaDefinition);
  }

  goBack(): void {
    this.location.back();
  }

  triggerTestError(): void {
    this.errorState.setError(new Error('Simulated runtime exception from Tablz Simulator.'));
  }
}
