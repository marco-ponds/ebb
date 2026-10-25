import type { ReactNode } from 'react';
import styles from './Live.module.css';

export interface LiveLayoutSlots {
  header: ReactNode;
  banner?: ReactNode;
  notices?: ReactNode;
  /** Strength picker (Task 8). */
  rating?: ReactNode;
  stats?: ReactNode;
  averages?: ReactNode;
  pattern?: ReactNode;
  hero: ReactNode;
  /** Breathing caption under the hero. */
  caption?: ReactNode;
  timeline?: ReactNode;
  /** Action row (Task 8). */
  actionRow?: ReactNode;
  /** End-session control (Task 8). */
  endSlot?: ReactNode;
  /** Screen-reader announcements and sheets: rendered outside the visual flow. */
  overlay?: ReactNode;
}

/**
 * Top to bottom: header, banner, notices, rating, stats, averages, pattern, hero, caption, timeline, action row, end.
 * Every slot is optional and takes a node, so Task 8 can fill one without restructuring. Landscape phones put the
 * hero in the left half and everything else on the right.
 */
export function LiveLayout(p: LiveLayoutSlots & { contracting: boolean }) {
  const slot = (name: string, node: ReactNode) =>
    node ? (
      <div className={styles.slot} data-slot={name}>
        {node}
      </div>
    ) : null;
  return (
    <main className={styles.screen} data-contracting={p.contracting ? 'true' : 'false'}>
      {slot('header', p.header)}
      {slot('banner', p.banner)}
      {slot('notices', p.notices)}
      {slot('rating', p.rating)}
      {slot('stats', p.stats)}
      {slot('averages', p.averages)}
      {slot('pattern', p.pattern)}
      {slot('hero', p.hero)}
      {slot('caption', p.caption)}
      {slot('timeline', p.timeline)}
      {slot('action-row', p.actionRow)}
      {slot('end', p.endSlot)}
      {p.overlay}
    </main>
  );
}
