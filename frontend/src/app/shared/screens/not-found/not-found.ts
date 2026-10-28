import { Component, inject, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Meta, MetaDefinition, Title } from '@angular/platform-browser';
import { ErrorStateService } from '../../../core/services/error-state/error-state.service';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './not-found.html',
  styleUrl: './not-found.scss',
})
export class NotFound implements OnInit {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(Title);
  private readonly meta = inject(Meta);
  private readonly transloco = inject(TranslocoService);
  private readonly errorState = inject(ErrorStateService);

  ngOnInit(): void {
    this.pageTitle.setTitle(this.transloco.translate('errors.notFound.pageTitle'));
    this.meta.updateTag({
      name: 'description',
      content: this.transloco.translate('errors.notFound.metaDescription'),
    } as MetaDefinition);
  }

  goBack(): void {
    this.location.back();
  }

  triggerTestError(): void {
    this.errorState.setError(new Error('Simulated runtime exception from Tablz Simulator.'));
  }
}
