import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

type SchemaContext = { image: () => any };

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }: SchemaContext) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Short label shown on the post's auto-generated social-preview image
			// (e.g. "Part I") — falls back to "Blog Post" when unset.
			subtitle: z.string().optional(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: image().optional(),
			authors: z.array(z.string()).optional(), // References 'id' in authors.json
			toc: z.boolean().optional(),
			tags: z.array(z.string()).optional(),
		}),
});

const news = defineCollection({
	// Load Markdown and MDX files in the `src/content/news/` directory.
	loader: glob({ base: './src/content/news', pattern: '**/*.{md,mdx}' }),
	schema: () =>
		z.object({
			title: z.string(),
			date: z.coerce.date(),
			summary: z.string(),
			// Optional small illustrative image (a plain public/ path, e.g.
			// '/performance.png') shown alongside the summary on both /news
			// and the homepage's "Latest News" preview — not a full hero
			// image, just a supporting graphic for the announcement.
			image: z.string().optional(),
			// When set, the news item's title links out to this URL instead of
			// rendering as plain text (e.g. a program committee page, a talk
			// recording, a press mention) — or links to another page on this
			// site itself (e.g. '/publications#some-entry'), which must stay
			// root-relative rather than a hardcoded absolute URL
			// so it isn't tied to one domain.
			link: z
				.string()
				.refine((val) => val.startsWith('/') || /^https?:\/\//.test(val), {
					message: 'link must be a root-relative path (starting with /) or an absolute http(s) URL',
				})
				.optional(),
			// Retiring an item: set this to true rather than deleting the file
			// or its markdown body. There is no pagination and no cutoff, so
			// this is the only way an entry stops showing on /news.
			archived: z.boolean().default(false),
		}),
});

export const collections = { blog, news };
