import { useQuery } from "@tanstack/react-query";
import { type ApiKey, getApiKeys } from "src/api/backend";

const fetchApiKeys = () => {
	return getApiKeys();
};

const useApiKeys = (options = {}) => {
	return useQuery<ApiKey[], Error>({
		queryKey: ["api-keys"],
		queryFn: fetchApiKeys,
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchApiKeys, useApiKeys };
