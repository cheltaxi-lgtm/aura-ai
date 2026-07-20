export type SeoArticle = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: { heading: string; body: string }[];
  intentSlugs: string[];
  relatedHrefs?: { href: string; title: string }[];
};
