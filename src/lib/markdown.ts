import { marked } from 'marked';
// xss 是 CJS，dev 的 workerd runner 不支援具名匯入，改用預設匯入再解構
import xssPkg from 'xss';

const { FilterXSS, getDefaultWhiteList } = xssPkg as unknown as typeof import('xss');

const tags = getDefaultWhiteList();
delete tags.img;
// 去掉 target（連結不開新分頁，也就不需要 rel）與 img（避免遠端圖片追蹤）
const whiteList = Object.fromEntries(
	Object.entries(tags).map(([k, attrs]) => [k, (attrs ?? []).filter((a) => a !== 'target')])
);
const xss = new FilterXSS({
	whiteList,
	stripIgnoreTag: true,
	stripIgnoreTagBody: ['script', 'style']
});

// marked 不消毒；xss 為純 JS（無 DOM 依賴），Workers 與瀏覽器皆可用。預設白名單會移除 script、on* 屬性與 javascript: 連結
export const renderMarkdown = (src: string) =>
	xss.process(marked.parse(src, { async: false, gfm: true, breaks: true }));
