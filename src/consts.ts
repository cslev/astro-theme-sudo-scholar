// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Your Name';
export const SITE_DESCRIPTION = 'TODO: replace with a one-line description of your academic/professional portfolio.';

// Short footer tagline — distinct from SITE_DESCRIPTION (used for the
// meta/SEO description elsewhere) since this one's meant to carry some
// personality rather than read like search-result copy.
export const FOOTER_TAGLINE =
  'TODO: replace with a one-line tagline for the footer.';

// No PDF is generated yet — the print stylesheet on /cv is the only
// CV-export mechanism out of the box. Setting this non-empty later
// automatically restores the CV nav/footer download affordances that used
// to be wired to it (see README.md).
export const CV_URL = '';

export const CONTACT = {
  emails: [
    'TODO@example.com',
  ],
  // Optional — delete this line (and the emailNote usage in Footer.astro)
  // if you don't need a disclaimer under your contact email.
  emailNote: '',
};

export type SocialIcon = 'website' | 'scholar' | 'email' | 'github' | 'linkedin' | 'twitter' | 'medium' | 'dockerhub' | 'matrix';

// TODO: replace with your own social links. Delete any entries you don't
// need, or add more — each just needs a label, href, and one of the
// SocialIcon values above (see Footer.astro for the icon set).
export const SOCIAL_LINKS: ReadonlyArray<{
  label: string;
  href: string;
  icon: SocialIcon;
}> = [
  {
    label: 'GitHub',
    href: 'https://github.com/TODO',
    icon: 'github',
  },
  {
    label: 'LinkedIn',
    href: 'https://linkedin.com/in/TODO',
    icon: 'linkedin',
  },
  {
    label: 'Google Scholar',
    href: 'https://scholar.google.com/citations?user=TODO',
    icon: 'scholar',
  },
  {
    label: 'Email',
    href: 'mailto:TODO@example.com',
    icon: 'email',
  },
];
