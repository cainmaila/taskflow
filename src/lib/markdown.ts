import { marked } from 'marked';
import { filterXSS } from 'xss';

// marked 不消毒；xss 為純 JS（無 DOM 依賴），Workers 與瀏覽器皆可用。預設白名單會移除 script、on* 屬性與 javascript: 連結
export const renderMarkdown = (src: string) =>
	filterXSS(marked.parse(src, { async: false, gfm: true, breaks: true }));
