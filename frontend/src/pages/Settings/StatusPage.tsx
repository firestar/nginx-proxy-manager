import { Field, Form, Formik } from "formik";
import cn from "classnames";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Select from "react-select";
import { Button, Loading } from "src/components";
import { useSetSetting, useSetting, useTags } from "src/hooks";
import type { Tag, StatusPageMeta } from "src/api/backend";
import { showObjectSuccess } from "src/notifications";

interface TagOption {
	value: number;
	label: string;
}

export default function StatusPage() {
	const { data, isLoading, error } = useSetting("status-page");
	const { mutate: setSetting } = useSetSetting();
	const { data: tags = [] } = useTags();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const tagOptions: TagOption[] = tags.map((t: Tag) => ({ value: t.id || 0, label: t.name }));

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const meta: StatusPageMeta = {
			slug: values.slug || "status",
			title: values.title || "Service Status",
			tag_id: values.tagId || null,
			host_ids: [],
		};

		setSetting(
			{ id: "status-page", value: values.enabled ? "enabled" : "disabled", meta },
			{
				onError: (err: any) => setErrorMsg(err.message),
				onSuccess: () => showObjectSuccess("status-page", "saved"),
				onSettled: () => {
					setIsSubmitting(false);
					setSubmitting(false);
				},
			},
		);
	};

	if (isLoading) return <Loading noLogo />;
	if (error) return <Alert variant="danger">{error.message}</Alert>;

	const meta = (data?.meta ?? {}) as StatusPageMeta;

	return (
		<Formik
			initialValues={{
				enabled: data?.value === "enabled",
				slug: meta.slug || "status",
				title: meta.title || "Service Status",
				tagId: meta.tag_id || null,
			}}
			onSubmit={onSubmit}
			enableReinitialize
		>
			{({ values, setFieldValue }: any) => (
				<Form>
					{errorMsg && (
						<Alert variant="danger" dismissible onClose={() => setErrorMsg(null)}>
							{errorMsg}
						</Alert>
					)}

					<div className="card-body">
						<h4 className="mb-3">Status Page</h4>

						{/* Enable toggle */}
						<div className="mb-3">
							<label className="row" htmlFor="statusPageEnabled">
								<span className="col">Enable public status page</span>
								<span className="col-auto">
									<Field name="enabled" type="checkbox">
										{({ field }: any) => (
											<label className="form-check form-check-single form-switch">
												<input
													{...field}
													id="statusPageEnabled"
													className={cn("form-check-input", { "bg-lime": field.checked })}
													type="checkbox"
												/>
											</label>
										)}
									</Field>
								</span>
							</label>
						</div>

						{/* Slug */}
						<Field name="slug">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="statusSlug">
										URL slug
									</label>
									<input
										id="statusSlug"
										type="text"
										className="form-control"
										placeholder="status"
										{...field}
									/>
									<small className="form-hint">
										Public URL: <code>/status/{values.slug || "status"}</code>
									</small>
								</div>
							)}
						</Field>

						{/* Title */}
						<Field name="title">
							{({ field }: any) => (
								<div className="mb-3">
									<label className="form-label" htmlFor="statusTitle">
										Page title
									</label>
									<input
										id="statusTitle"
										type="text"
										className="form-control"
										placeholder="Service Status"
										{...field}
									/>
								</div>
							)}
						</Field>

						{/* Tag selector */}
						<div className="mb-3">
							<label className="form-label">Filter hosts by tag</label>
							<Select
								className="react-select-container"
								classNamePrefix="react-select"
								isClearable
								options={tagOptions}
								value={tagOptions.find((o) => o.value === values.tagId) ?? null}
								onChange={(opt: TagOption | null) => setFieldValue("tagId", opt ? opt.value : null)}
								placeholder="All check-enabled hosts (no filter)"
							/>
							<small className="form-hint">
								Select a tag to show only those hosts, or leave blank to show all hosts with uptime checks enabled.
							</small>
						</div>
					</div>

					<div className="card-footer text-end">
						<Button type="submit" actionType="primary" className="bg-lime" isLoading={isSubmitting} disabled={isSubmitting}>
							Save
						</Button>
					</div>
				</Form>
			)}
		</Formik>
	);
}
