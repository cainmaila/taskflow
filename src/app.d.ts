import type { User, Session } from 'better-auth';
import { createAuth } from '#lib/server/auth.ts';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: User & { role?: string | null };
			session?: Session;
			auth: ReturnType<typeof createAuth>;
		}

		// interface Error {}
		// interface PageData {}
		interface PageState {
			selected?: import('./routes/tasks/[id]/$types').PageData;
		}
		// interface Platform {}
	}
}

export {};
