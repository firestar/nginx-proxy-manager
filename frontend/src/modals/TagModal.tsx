import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import type { Tag } from "src/api/backend";
import { Button, Loading } from "src/components";
import { useSetTag, useTag } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showTagModal = (id: number | "new") => {
	EasyModal.show(TagModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const TagModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useTag(id);
	const { mutate: setTag } = useSetTag();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setTag(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("tag", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			{!isLoading && error && (
				<Alert variant="danger" className="m-3">
					{error?.message || "Unknown error"}
				</Alert>
			)}
			{isLoading && <Loading noLogo />}
			{!isLoading && data && (
				<Formik
					initialValues={
						{
							name: data?.name || "",
							color: data?.color || "",
						} as Tag
					}
					onSubmit={onSubmit}
				>
					{() => (
						<Form>
							<Modal.Header closeButton>
								<Modal.Title>
									<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "tag" }} />
								</Modal.Title>
							</Modal.Header>
							<Modal.Body>
								<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
									{errorMsg}
								</Alert>
								<Field name="name" validate={validateString(1, 100)}>
									{({ field, form }: any) => (
										<div className="mb-3">
											<label htmlFor="name" className="form-label">
												<T id="column.name" />
											</label>
											<input
												id="name"
												type="text"
												required
												autoComplete="off"
												className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`}
												{...field}
											/>
											{form.errors.name ? (
												<div className="invalid-feedback">
													{form.errors.name && form.touched.name ? form.errors.name : null}
												</div>
											) : null}
										</div>
									)}
								</Field>
								<Field name="color">
									{({ field }: any) => (
										<div className="mb-3">
											<label htmlFor="color" className="form-label">
												<T id="column.color" />
											</label>
											<div className="input-group">
												<input
													id="color"
													type="color"
													className="form-control form-control-color"
													value={field.value || "#206bc4"}
													onChange={field.onChange}
													name={field.name}
												/>
												<input
													type="text"
													className="form-control"
													autoComplete="off"
													placeholder="#206bc4"
													{...field}
												/>
											</div>
										</div>
									)}
								</Field>
							</Modal.Body>
							<Modal.Footer>
								<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									actionType="primary"
									className="ms-auto bg-purple"
									data-bs-dismiss="modal"
									isLoading={isSubmitting}
									disabled={isSubmitting}
								>
									<T id="save" />
								</Button>
							</Modal.Footer>
						</Form>
					)}
				</Formik>
			)}
		</Modal>
	);
});

export { showTagModal };
