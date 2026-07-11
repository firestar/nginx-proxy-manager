import type { Tag } from "src/api/backend";
import { getTagIcon } from "src/modules/TagIcons";

interface Props {
	tag: Tag;
	className?: string;
	onClick?: (tag: Tag) => void;
}
export function TagChip({ tag, className, onClick }: Props) {
	const Icon = getTagIcon(tag.icon);
	const style = tag.color ? { backgroundColor: tag.color, color: "#fff" } : undefined;
	const content = (
		<>
			{Icon ? <Icon size={12} className="me-1" /> : null}
			{tag.name}
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				className={`badge border-0 ${className || ""}`}
				style={{ ...style, cursor: "pointer" }}
				title={tag.name}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onClick(tag);
				}}
			>
				{content}
			</button>
		);
	}

	return (
		<span className={`badge ${className || ""}`} style={style}>
			{content}
		</span>
	);
}
