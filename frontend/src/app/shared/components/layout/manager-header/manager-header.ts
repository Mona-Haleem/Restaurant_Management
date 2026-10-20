import { Component, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, of, switchMap } from 'rxjs';

@Component({
  selector: 'app-manager-header,header[app-manager-header]',
  imports: [TranslocoPipe],
  templateUrl: './manager-header.html',
  styleUrl: './manager-header.scss',
  host: {
    role: 'banner',
  },
})
export class ManagerHeader {
  isMobile = input<boolean>();
  headerTitle = input.required<string>();
  private readonly transloco = inject(TranslocoService, { optional: true });

  translatedTitle = toSignal(
    toObservable(this.headerTitle).pipe(
      switchMap((raw) => {
        if (!raw) return of('');
        if (!this.transloco) return of(raw);

        const key = `navigation.${raw}`;
        return this.transloco
          .selectTranslate(key)
          .pipe(map((value) => (value && value !== key ? value : raw)));
      }),
    ),
    { initialValue: '' },
  );
}
