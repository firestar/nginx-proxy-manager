import type { ReactNode } from "react";
import type { Tag } from "src/api/backend";
import { TagChip } from "src/components/TagChip";

interface Props {
	tags?: Tag[];
	onTagClick?: (tag: Tag) => void;
}
export function TagsFormatter({ tags, onTagClick }: Props) {
	if (!tags || tags.length === 0) {
		return null;
	}
	const elms: ReactNode[] = tags.map((tag) => (
		<TagChip key={tag.id} tag={tag} className="me-1" onClick={onTagClick} />
	));
	return <div className="flex-fill">{...elms}</div>;
}
