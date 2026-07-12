// Project data for the planet field. Replace these placeholders with real work.
// Shape per README: { index, slug, title, year, kind, desc } — index drives the
// "01".."12" labels; kind and year render as chips in the detail card.
export const projects = Array.from({ length: 12 }, (_, i) => ({
  index: i,
  slug: `coming-soon-${i + 1}`,
  title: 'Coming soon',
  year: '2026',
  kind: 'In progress',
  desc: 'This project is coming soon. A finished animation will live here — check back shortly.',
}));
