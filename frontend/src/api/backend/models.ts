export interface AppVersion {
	major: number;
	minor: number;
	revision: number;
}

export interface UserPermissions {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	userId?: number;
	visibility: string;
	proxyHosts: string;
	redirectionHosts: string;
	deadHosts: string;
	streams: string;
	accessLists: string;
	certificates: string;
}

export interface User {
	id: number;
	createdOn: string;
	modifiedOn: string;
	isDisabled: boolean;
	email: string;
	name: string;
	nickname: string;
	avatar: string;
	roles: string[];
	permissions?: UserPermissions;
	tagIds?: number[];
}

export interface AuditLog {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	objectType: string;
	objectId: number;
	action: string;
	meta: Record<string, any>;
	// Expansions:
	user?: User;
}

export interface ApiKey {
	id: number;
	createdOn: string;
	modifiedOn: string;
	userId: number;
	name: string;
	lastUsedOn: string | null;
	/** "resource:level" strings. Null/absent = unrestricted (acts as the owning user). */
	scopes?: string[] | null;
	/** Full secret. Only present in create/reroll responses, never again. */
	key?: string;
}

export interface AccessList {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId: number;
	name: string;
	meta: Record<string, any>;
	satisfyAny: boolean;
	passAuth: boolean;
	proxyHostCount?: number;
	// Expansions:
	owner?: User;
	items?: AccessListItem[];
	clients?: AccessListClient[];
}

export interface Tag {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	ownerUserId?: number;
	name: string;
	color?: string;
	icon?: string;
	meta?: Record<string, any>;
	// Expansions:
	owner?: User;
}

export interface AccessListItem {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	username: string;
	password: string;
	meta?: Record<string, any>;
	hint?: string;
}

export type AccessListClient = {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	accessListId?: number;
	address: string;
	directive: "allow" | "deny";
	meta?: Record<string, any>;
};

export interface Certificate {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	provider: string;
	niceName: string;
	domainNames: string[];
	expiresOn: string;
	meta: Record<string, any>;
	owner?: User;
	proxyHosts?: ProxyHost[];
	deadHosts?: DeadHost[];
	redirectionHosts?: RedirectionHost[];
}

export interface ProxyHeader {
	direction: "request" | "response";
	action: "set" | "remove";
	name: string;
	value: string;
}

export interface ProxyLocation {
	path: string;
	advancedConfig: string;
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
}

export interface ProxyHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardScheme: string;
	forwardHost: string;
	forwardPort: number;
	accessListId: number;
	certificateId: number;
	sslForced: boolean;
	cachingEnabled: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	allowWebsocketUpgrade: boolean;
	http2Support: boolean;
	enabled: boolean;
	maintenanceMode: boolean;
	locations?: ProxyLocation[];
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	trustForwardedProto: boolean;
	clientMaxBodySize?: string | null;
	proxyConnectTimeout?: number | null;
	proxySendTimeout?: number | null;
	proxyReadTimeout?: number | null;
	proxyBuffering?: string | null;
	checkEnabled?: boolean;
	checkPath?: string;
	checkIntervalS?: number;
	expectedStatus?: string;
	headers?: ProxyHeader[] | null;
	tagIds?: number[];
	nodeId?: number | null;
	nodeAll?: boolean;
	// Expansions:
	owner?: User;
	accessList?: AccessList;
	certificate?: Certificate;
	tags?: Tag[];
}

export interface DeadHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	certificateId: number;
	sslForced: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	tagIds?: number[];
	nodeId?: number | null;
	nodeAll?: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	tags?: Tag[];
}

export interface RedirectionHost {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	domainNames: string[];
	forwardDomainName: string;
	preservePath: boolean;
	certificateId: number;
	sslForced: boolean;
	blockExploits: boolean;
	advancedConfig: string;
	meta: Record<string, any>;
	http2Support: boolean;
	forwardScheme: string;
	forwardHttpCode: number;
	enabled: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	tagIds?: number[];
	nodeId?: number | null;
	nodeAll?: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	tags?: Tag[];
}

export interface Stream {
	id: number;
	createdOn: string;
	modifiedOn: string;
	ownerUserId: number;
	incomingPort: number;
	forwardingHost: string;
	forwardingPort: number;
	tcpForwarding: boolean;
	udpForwarding: boolean;
	meta: Record<string, any>;
	enabled: boolean;
	certificateId: number;
	tagIds?: number[];
	nodeId?: number | null;
	nodeAll?: boolean;
	// Expansions:
	owner?: User;
	certificate?: Certificate;
	tags?: Tag[];
}

export interface Setting {
	id: string;
	name?: string;
	description?: string;
	value: string;
	meta?: Record<string, any>;
}

export interface DNSProvider {
	id: string;
	name: string;
	credentials: string;
}

export interface NotificationChannel {
	id?: number;
	createdOn?: string;
	modifiedOn?: string;
	name: string;
	type: "webhook" | "slack" | "discord" | "telegram" | "ntfy" | "email";
	config: Record<string, any>;
	events: string[];
	enabled: boolean;
}

export interface NotificationLog {
	id: number;
	channelId: number;
	event: string;
	status: "sent" | "failed";
	detail: string | null;
	createdOn: string;
}

export interface UpstreamStatus {
	id: number;
	domainNames: string[];
	status: "up" | "down" | "unknown";
	latency_ms: number | null;
	last_checked: string | null;
	uptime: {
		d1: number;
		d7: number;
		d90: number;
	};
}

export interface PublicStatusHost {
	name: string;
	status: "up" | "down" | "unknown";
	uptime: {
		d1: number;
		d7: number;
		d90: number;
	};
}

export interface PublicStatusPage {
	title: string;
	generated_on: string;
	hosts: PublicStatusHost[];
}

export interface StatusPageMeta {
	slug: string;
	title: string;
	tag_id: number | null;
	host_ids: number[];
}

export interface NPMNode {
	id: number;
	createdOn: string;
	modifiedOn: string;
	name: string;
	status: "pending" | "online" | "offline";
	lastSeen: string | null;
	version: string | null;
	configVersion: number;
	meta: Record<string, any>;
	/** Live WebSocket session present right now */
	connected?: boolean;
	/** One-time enrollment token. Only present in create/token-regenerate responses, never again. */
	token?: string;
	setupCommand?: string;
}