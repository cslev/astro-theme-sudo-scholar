// Whether a Markdown source actually uses LaTeX math ($...$ / $$...$$),
// so pages can skip loading the KaTeX stylesheet unless they need it.
//
// Code fences/spans are stripped first — a shell snippet like
// `$host$request_uri` or `$PATH` would otherwise look like inline math to a
// naive regex, even though remark-math never parses inside code anyway.
// Inline candidates additionally need a letter, digit-adjacent caret/
// underscore, or a LaTeX command inside — otherwise something like a price
// range ("$5–$7/month") reads as a false positive, since it's structurally
// identical to $...$ math with no other distinguishing signal.
const DISPLAY_MATH = /\$\$[^$]+\$\$/;
const INLINE_MATH_CANDIDATE = /\$([^\s$](?:[^$\n]*[^\s$])?)\$/g;
const LOOKS_LIKE_MATH = /[a-zA-Z\\^_{}]/;

export function hasMathContent(raw: string): boolean {
	const stripped = raw
		.replace(/```[\s\S]*?```/g, '')
		.replace(/`[^`\n]*`/g, '')
		// A backslash-escaped `\$` (the standard way to write a literal
		// dollar sign in Markdown next to real math) is never a delimiter.
		.replace(/\\\$/g, '');
	if (DISPLAY_MATH.test(stripped)) return true;
	for (const match of stripped.matchAll(INLINE_MATH_CANDIDATE)) {
		if (LOOKS_LIKE_MATH.test(match[1])) return true;
	}
	return false;
}
