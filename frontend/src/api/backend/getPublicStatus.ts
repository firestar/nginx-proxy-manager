import * as api from "./base";
import type { PublicStatusPage } from "./models";

export async function getPublicStatus(slug: string): Promise<PublicStatusPage> {
	return await api.get({ url: `/status/${slug}` });
}
