import { useQuery } from "@tanstack/react-query";
import { getPublicStatus, type PublicStatusPage } from "src/api/backend";

const usePublicStatus = (slug: string, options = {}) => {
	return useQuery<PublicStatusPage, Error>({
		queryKey: ["public-status", slug],
		queryFn: () => getPublicStatus(slug),
		refetchInterval: 60 * 1000,
		staleTime: 55 * 1000,
		refetchOnWindowFocus: false,
		enabled: !!slug,
		...options,
	});
};

export { usePublicStatus };
