import { fileURLToPath } from "node:url";
import { compile } from "sass";

const APP_STYLE_ENTRY = new URL("../src/App.scss", import.meta.url);

/**
 * Compile the app stylesheet so contract tests assert on the CSS the browser
 * actually receives, rather than on how the SCSS partials happen to be
 * nested or split up.
 *
 * Sass drops the quotes from attribute selectors; they are restored so the
 * assertions can be written the way the selectors read in source.
 */
export function compileAppStyles() {
  const { css } = compile(fileURLToPath(APP_STYLE_ENTRY), { style: "expanded" });
  return css.replace(/\[([\w-]+)=([A-Za-z][\w-]*)\]/g, '[$1="$2"]');
}
