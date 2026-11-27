// Refreshes the site's cached pages for the given recipe slugs, e.g. after a
// sync whose refresh step printed a warning.
import { revalidateSitePages } from "./lib/revalidate-site-pages.mjs";

const slugs = process.argv.slice(2);
if (slugs.length === 0) throw new Error("Pass at least one recipe slug.");
const invalid = slugs.filter((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));
if (invalid.length > 0) throw new Error(`Invalid recipe slug(s): ${invalid.join(", ")}`);

if (!(await revalidateSitePages(slugs))) process.exitCode = 1;
