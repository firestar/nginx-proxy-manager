import Select, { type MultiValue } from "react-select";
import type { Tag } from "src/api/backend";
import { useTags } from "src/hooks";
import { intl } from "src/locale";

interface TagOption {
	readonly value: number;
	readonly label: string;
}

interface Props {
	value: number[];
	onChange: (ids: number[]) => void;
}
export function TagFilter({ value, onChange }: Props) {
	const { data } = useTags();

	const options: TagOption[] =
		data?.map((tag: Tag) => ({
			value: tag.id || 0,
			label: tag.name,
		})) || [];

	const handleChange = (newValue: MultiValue<TagOption>) => {
		onChange(newValue.map((o) => o.value));
	};

	if (!data?.length) {
		return null;
	}

	return (
		<div style={{ minWidth: 200 }}>
			<Select
				className="react-select-container react-select-sm"
				classNamePrefix="react-select"
				isMulti
				closeMenuOnSelect={false}
				options={options}
				placeholder={intl.formatMessage({ id: "tags.filter" })}
				value={options.filter((o) => value.includes(o.value))}
				onChange={handleChange}
			/>
		</div>
	);
}
