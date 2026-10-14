import { error, fail } from '@sveltejs/kit';
import { ProjectError, ProjectForbiddenError, ProjectNotFoundError } from './project-rules';

/** 專案錯誤對應 HTTP：NotFound → 404、Forbidden → 403、其餘 → 400；非專案錯誤原樣丟出 */
export const projectFailure = (e: unknown) => {
	if (e instanceof ProjectNotFoundError) error(404, e.message);
	if (e instanceof ProjectForbiddenError) return fail(403, { message: e.message });
	if (e instanceof ProjectError) return fail(400, { message: e.message });
	throw e;
};

/** load 專用：load 不能回傳 fail()，一律丟 HTTP 錯誤 */
export const projectLoadError = (e: unknown): never => {
	if (e instanceof ProjectNotFoundError) error(404, e.message);
	if (e instanceof ProjectForbiddenError) error(403, e.message);
	if (e instanceof ProjectError) error(400, e.message);
	throw e;
};
