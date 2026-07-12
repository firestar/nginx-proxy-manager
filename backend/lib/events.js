import { EventEmitter } from "node:events";

// Event name constants
export const HOST_OFFLINE = "host.offline";
export const HOST_ONLINE = "host.online";
export const CERTIFICATE_EXPIRING = "certificate.expiring";
export const CERTIFICATE_RENEWAL_FAILED = "certificate.renewal_failed";
export const UPSTREAM_DOWN = "upstream.down";
export const UPSTREAM_UP = "upstream.up";
export const BACKUP_OK = "backup.ok";
export const BACKUP_FAILED = "backup.failed";
export const NODE_OFFLINE = "node.offline";
export const NODE_ONLINE = "node.online";
export const NODE_CONFIG_FAILED = "node.config_failed";

// Singleton event bus
const bus = new EventEmitter();
bus.setMaxListeners(20);

export default bus;
