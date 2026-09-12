import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage } from "../utils/generateOgImage";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";
import projectsData from "../data/projects.json";

export async function getStaticPaths() {
    const posts = await getCollection('blog');

    // Base static pages
    const staticPages = [
        { params: { route: 'og' }, props: { title: SITE_TITLE, subtitle: SITE_DESCRIPTION } },
        { params: { route: 'cv' }, props: { title: 'CV', subtitle: SITE_TITLE } },
        { params: { route: 'projects' }, props: { title: 'Beyond', subtitle: SITE_TITLE } },
        { params: { route: 'publications' }, props: { title: 'Publications', subtitle: SITE_TITLE } },
        { params: { route: 'news' }, props: { title: 'News', subtitle: SITE_TITLE } },
        { params: { route: 'blog' }, props: { title: 'Blog', subtitle: SITE_TITLE } },
    ];

    // Dynamic blog posts
    const blogPages = posts.map((post) => ({
        params: { route: `blog/${post.id}` },
        props: {
            title: post.data.title,
            subtitle: post.data.subtitle || 'Blog Post',
            meta: post.data.pubDate.toLocaleDateString('en-us', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
            }),
        },
    }));

    const projectPages = projectsData.map((project) => ({
        params: { route: `projects/${project.id}` },
        props: { title: project.title, subtitle: 'Research Project' },
    }));

    return [...staticPages, ...blogPages, ...projectPages];
}

export const GET: APIRoute = async ({ props }) => {
    const safeTitle = (props.title as string).replace(/&/g, 'and');
    return new Response(await generateOgImage(safeTitle, props.subtitle as string, props.meta as string | undefined), {
        headers: { "Content-Type": "image/png" },
    });
};
