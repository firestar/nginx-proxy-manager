import type { ReactNode } from "react";
import type { Tag } from "src/api/backend";

interface Props {
	tags?: Tag[];
}
export function TagsFormatter({ tags }: Props) {
	if (!tags || tags.length === 0) {
		return null;
	}
	const elms: ReactNode[] = tags.map((tag) => (
		<span
			key={tag.id}
			className="badge me-1"
			style={tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined}
		>
			{tag.name}
		</span>
	));
	return <div className="flex-fill">{...elms}</div>;
}
