import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import Select, { type MultiValue } from "react-select";
import {
	type Tag,
	updateDeadHost,
	updateProxyHost,
	updateRedirectionHost,
	updateStream,
} from "src/api/backend";
import { Button } from "src/components";
import { useTags } from "src/hooks";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

export type BulkHostType = "proxy" | "redirection" | "dead" | "stream";

export interface BulkHost {
	id?: number;
	tags?: Tag[];
}

const CONFIG: Record<
	BulkHostType,
	{ object: string; update: (item: any) => Promise<any>; queryKeys: string[] }
> = {
	proxy: {
		object: "proxy-host",
		update: updateProxyHost,
		queryKeys: ["proxy-hosts", "proxy-host"],
	},
	redirection: {
		object: "redirection-host",
		update: updateRedirectionHost,
		queryKeys: ["redirection-hosts", "redirection-host"],
	},
	dead: {
		object: "dead-host",
		update: updateDeadHost,
		queryKeys: ["dead-hosts", "dead-host"],
	},
	stream: {
		object: "stream",
		update: updateStream,
		queryKeys: ["streams", "stream"],
	},
};

interface TagOption {
	readonly value: number;
	readonly label: string;
}

const showBulkTagModal = (type: BulkHostType, hosts: BulkHost[]) => {
	EasyModal.show(BulkTagModal, { type, hosts });
};

interface Props extends InnerModalProps {
	type: BulkHostType;
	hosts: BulkHost[];
}
const BulkTagModal = EasyModal.create(({ type, hosts, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data: tags } = useTags();
	const [addIds, setAddIds] = useState<number[]>([]);
	const [removeIds, setRemoveIds] = useState<number[]>([]);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const config = CONFIG[type];
	const options: TagOption[] =
		tags?.map((tag: Tag) => ({
			value: tag.id || 0,
			label: tag.name,
		})) || [];

	const onSubmit = async () => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);
		try {
			for (const host of hosts) {
				if (!host.id) continue;
				const current = host.tags?.map((t) => t.id || 0).filter((n) => n > 0) || [];
				const merged = [...new Set([...current, ...addIds])].filter(
					(id) => !removeIds.includes(id),
				);
				const changed =
					merged.length !== current.length || merged.some((id) => !current.includes(id));
				if (changed) {
					await config.update({ id: host.id, tagIds: merged });
				}
			}
			for (const key of config.queryKeys) {
				queryClient.invalidateQueries({ queryKey: [key] });
			}
			showObjectSuccess(config.object, "saved");
			remove();
		} catch (err: any) {
			setErrorMsg(err?.message || "Unknown error");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Modal.Header closeButton>
				<Modal.Title>
					<T id="bulk.edit-tags" />
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
					{errorMsg}
				</Alert>
				<p className="text-muted">
					<T id="bulk.selected" data={{ count: hosts.length }} />
				</p>
				<div className="mb-3">
					<label className="form-label" htmlFor="bulk-add-tags">
						<T id="bulk.add-tags" />
					</label>
					<Select
						className="react-select-container"
						classNamePrefix="react-select"
						inputId="bulk-add-tags"
						isMulti
						closeMenuOnSelect={false}
						options={options}
						placeholder={intl.formatMessage({ id: "tags.placeholder" })}
						value={options.filter((o) => addIds.includes(o.value))}
						onChange={(v: MultiValue<TagOption>) => setAddIds(v.map((o) => o.value))}
					/>
				</div>
				<div className="mb-3">
					<label className="form-label" htmlFor="bulk-remove-tags">
						<T id="bulk.remove-tags" />
					</label>
					<Select
						className="react-select-container"
						classNamePrefix="react-select"
						inputId="bulk-remove-tags"
						isMulti
						closeMenuOnSelect={false}
						options={options}
						placeholder={intl.formatMessage({ id: "tags.placeholder" })}
						value={options.filter((o) => removeIds.includes(o.value))}
						onChange={(v: MultiValue<TagOption>) => setRemoveIds(v.map((o) => o.value))}
					/>
				</div>
			</Modal.Body>
			<Modal.Footer>
				<Button data-bs-dismiss="modal" onClick={remove} disabled={isSubmitting}>
					<T id="cancel" />
				</Button>
				<Button
					actionType="primary"
					className="ms-auto"
					isLoading={isSubmitting}
					disabled={isSubmitting || (!addIds.length && !removeIds.length)}
					onClick={onSubmit}
				>
					<T id="save" />
				</Button>
			</Modal.Footer>
		</Modal>
	);
});

export { showBulkTagModal };
