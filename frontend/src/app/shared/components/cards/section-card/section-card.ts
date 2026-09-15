import { Component, computed, contentChild, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

export type SectionCardHeadingLevel = 2 | 3 | 4 | 5 | 6;

/** Module-level counter for a unique id per instance, so the section's
 *  aria-labelledby always points at a heading id that exists only once
 *  on the page, even when several cards are rendered together. */
let nextSectionCardId = 0;

@Component({
  selector: 'app-section-card,section[app-section-card]',
  imports: [MatIcon],
  templateUrl: './section-card.html',
  styleUrl: './section-card.scss',
  host: {
    // The host element is the <section> itself. Giving it an accessible
    // name (via the heading below) is what makes browsers/AT expose it
    // as a "region" landmark instead of an unnamed, unnavigable section.
    '[attr.aria-labelledby]': 'titleId',
  },
})
export class SectionCard {
  title = input.required<string>();
  subtitle = input<string>();
  highlight = input<string>();
  readonly projectedIcon = contentChild('icon');
  icon = input<string>();
  titleIcon = input<string>();
  highlightIcon = input<string>();
  iconExist = computed(() => this.icon() || this.projectedIcon());
  size = input<{ title: string; subtitle: string; highlight: string }>({
    title: 'text-h3',
    subtitle: 'text-caption',
    highlight: 'text-body',
  });

  transparentHeader = input(false);

  /** Heading level for the card title (default h3). Lets consumers keep a
   *  correct, non-skipping heading hierarchy wherever the card is used. */
  headingLevel = input<SectionCardHeadingLevel>(3);

  private readonly uid = `section-card-${nextSectionCardId++}`;
  readonly titleId = `${this.uid}-title`;
}
