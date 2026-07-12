import { useState } from "react";
import { T } from "src/locale";
import Backup from "./Backup";
import DefaultSite from "./DefaultSite";
import HighAvailability from "./HighAvailability";
import Notifications from "./Notifications";
import StatusPage from "./StatusPage";

type SettingsSection = "default-site" | "notifications" | "status-page" | "backup" | "high-availability";

const navItem = (
	section: SettingsSection,
	active: SettingsSection,
	setSection: (s: SettingsSection) => void,
	label: string,
) => (
	<a
		href="#"
		className={`list-group-item list-group-item-action d-flex align-items-center${section === active ? " active" : ""}`}
		onClick={(e) => {
			e.preventDefault();
			setSection(section);
		}}
	>
		{label}
	</a>
);

export default function Layout() {
	const [section, setSection] = useState<SettingsSection>("default-site");

	return (
		<div className="card mt-4">
			<div className="card-status-top bg-teal" />
			<div className="card-table">
				<div className="card-header">
					<div className="row w-full">
						<h2 className="mt-1 mb-0">
							<T id="settings" />
						</h2>
					</div>
				</div>
				<div className="row g-0">
					<div className="col-12 col-md-3 border-end">
						<div className="card-body mt-0 pt-0">
							<div className="list-group list-group-transparent">
								{navItem("default-site", section, setSection, "Default Site")}
								{navItem("notifications", section, setSection, "Notifications")}
								{navItem("backup", section, setSection, "Backup & Restore")}
								{navItem("high-availability", section, setSection, "High Availability")}
								{navItem("backup", section, setSection, "Backup & Restore")}
							</div>
						</div>
					</div>
					<div className="col-12 col-md-9 d-flex flex-column">
						{section === "default-site" && <DefaultSite />}
						{section === "notifications" && <Notifications />}
						{section === "status-page" && <StatusPage />}
						{section === "backup" && <Backup />}
						{section === "high-availability" && <HighAvailability />}
					</div>
				</div>
			</div>
		</div>
	);
}
