import {
	IconAlertTriangle,
	IconApps,
	IconBolt,
	IconBox,
	IconBrandDocker,
	IconBug,
	IconCloud,
	IconCode,
	IconDatabase,
	IconDeviceDesktop,
	IconDeviceTv,
	IconFlag,
	IconFlask,
	IconFolder,
	IconGlobe,
	IconHeart,
	IconHome,
	IconKey,
	IconLock,
	IconMovie,
	IconMusic,
	IconNetwork,
	IconRocket,
	IconServer,
	IconShield,
	IconStar,
	IconTag,
	IconTool,
	IconUsers,
	IconWifi,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

interface IconProps {
	size?: number | string;
	className?: string;
}

// Curated set of Tabler icons selectable for tags. The key is what gets
// stored in tag.icon on the backend.
export const TAG_ICONS: Record<string, ComponentType<IconProps>> = {
	tag: IconTag,
	server: IconServer,
	database: IconDatabase,
	cloud: IconCloud,
	globe: IconGlobe,
	network: IconNetwork,
	wifi: IconWifi,
	docker: IconBrandDocker,
	box: IconBox,
	apps: IconApps,
	code: IconCode,
	tool: IconTool,
	rocket: IconRocket,
	bolt: IconBolt,
	flask: IconFlask,
	bug: IconBug,
	shield: IconShield,
	lock: IconLock,
	key: IconKey,
	users: IconUsers,
	home: IconHome,
	desktop: IconDeviceDesktop,
	tv: IconDeviceTv,
	movie: IconMovie,
	music: IconMusic,
	folder: IconFolder,
	star: IconStar,
	heart: IconHeart,
	flag: IconFlag,
	alert: IconAlertTriangle,
};

export function getTagIcon(name?: string): ComponentType<IconProps> | null {
	if (!name) {
		return null;
	}
	return TAG_ICONS[name] || null;
}

// Curated palette for the tag color picker.
export const TAG_COLORS = [
	"#6366f1",
	"#7c3aed",
	"#d63939",
	"#f76707",
	"#f59f00",
	"#74b816",
	"#2fb344",
	"#0ca678",
	"#17a2b8",
	"#4299e1",
	"#206bc4",
	"#d6336c",
	"#ae3ec9",
	"#0054a6",
	"#667382",
	"#1d273b",
];
