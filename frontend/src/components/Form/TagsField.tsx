import { Field, useFormikContext } from "formik";
import Select, { type ActionMeta, type MultiValue } from "react-select";
import type { Tag } from "src/api/backend";
import { useTags } from "src/hooks";
import { intl, T } from "src/locale";

interface TagOption {
	readonly value: number;
	readonly label: string;
}

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function TagsField({ name = "tagIds", label = "tags", id = "tagIds" }: Props) {
	const { isLoading, isError, error, data } = useTags();
	const { setFieldValue } = useFormikContext();

	const options: TagOption[] =
		data?.map((tag: Tag) => ({
			value: tag.id || 0,
			label: tag.name,
		})) || [];

	const handleChange = (newValue: MultiValue<TagOption>, _actionMeta: ActionMeta<TagOption>) => {
		setFieldValue(
			name,
			newValue.map((o) => o.value),
		);
	};

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3">
					<label className="form-label" htmlFor={id}>
						<T id={label} />
					</label>
					{isLoading ? <div className="placeholder placeholder-lg col-12 my-3 placeholder-glow" /> : null}
					{isError ? <div className="invalid-feedback">{`${error}`}</div> : null}
					{!isLoading && !isError ? (
						<Select
							className="react-select-container"
							classNamePrefix="react-select"
							name={field.name}
							id={id}
							isMulti
							closeMenuOnSelect={false}
							options={options}
							placeholder={intl.formatMessage({ id: "tags.placeholder" })}
							value={options.filter((o) => (field.value || []).includes(o.value))}
							onChange={handleChange}
						/>
					) : null}
					{form.errors[field.name] && form.touched[field.name] ? (
						<small className="text-danger">{form.errors[field.name]}</small>
					) : null}
				</div>
			)}
		</Field>
	);
}
