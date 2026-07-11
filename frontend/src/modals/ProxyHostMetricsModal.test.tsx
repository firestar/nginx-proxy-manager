import { render, screen, waitFor } from "@testing-library/react";
import EasyModal from "ez-modal-react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("src/hooks", async (importOriginal) => {
	const mod = await importOriginal<Record<string, unknown>>();
	return {
		...mod,
		useProxyHostMetrics: () => ({
			data: {
				range: "24h",
				buckets: [
					{
						bucket: "2026-07-11 14:30:00",
						requests: 10,
						bytesSent: 1024,
						status2xx: 8,
						status3xx: 1,
						status4xx: 1,
						status5xx: 0,
						cacheHits: 2,
					},
					{
						bucket: "2026-07-11 14:31:00",
						requests: 5,
						bytesSent: 2048,
						status2xx: 5,
						status3xx: 0,
						status4xx: 0,
						status5xx: 0,
						cacheHits: 0,
					},
				],
				totals: { requests: 15, bytesSent: 3072, cacheHitRatio: 0.13, errorRate: 0.06 },
			},
			isLoading: false,
			error: null,
		}),
	};
});

import { showProxyHostMetricsModal } from "src/modals";

describe("ProxyHostMetricsModal", () => {
	it("renders charts without crashing", async () => {
		render(<EasyModal.Provider />);
		await act(async () => {
			showProxyHostMetricsModal(1);
		});
		await waitFor(() => expect(screen.getByText("Total Requests")).toBeDefined());
	});
});
