export type AccessListExpansion = "owner" | "items" | "clients";
export type AuditLogExpansion = "user";
export type CertificateExpansion = "owner" | "proxy_hosts" | "redirection_hosts" | "dead_hosts" | "streams";
export type HostExpansion = "owner" | "certificate" | "tags";
export type ProxyHostExpansion = "owner" | "access_list" | "certificate" | "tags";
export type TagExpansion = "owner";
export type UserExpansion = "permissions";
