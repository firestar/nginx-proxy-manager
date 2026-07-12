import cn from "classnames";
import { T } from "src/locale";

interface Props {
	nginxOnline: boolean | undefined | null;
	nginxErr: string | undefined | null;
}

export function NginxOnlineFormatter({ nginxOnline, nginxErr }: Props) {
	if (nginxOnline === undefined || nginxOnline === null) {
		return null;
	}
	const firstErrLine = nginxErr ? nginxErr.split("\n").find((l) => l.trim()) : undefined;
	return (
		<span
			className={cn("status", nginxOnline ? "status-lime" : "status-red")}
			title={!nginxOnline && firstErrLine ? firstErrLine : undefined}
		>
			<span className="status-dot status-dot-animated" />
			<T id={nginxOnline ? "online" : "nginx.error"} />
		</span>
	);
}
