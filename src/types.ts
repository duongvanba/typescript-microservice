export type RemoteServiceResponse = { confirm?: string, success: boolean, data?: any, message?: string, ping?:any }

export type RemoteServiceRouteRequestOptions = {
    route?: any,
    on_ping?: <T>(data: T) => any
}

export type RemoteServiceRequestOptions = RemoteServiceRouteRequestOptions & {
    wait_result?: boolean
}

export type RPCRequestOptions = RemoteServiceRequestOptions & {
    service: string,
    method: string,
    args: any,
    timeout?: number
}

export type RemoteRPCService<T> = T & { set: (config: RemoteServiceRequestOptions) => T, fetch: (config?: RemoteServiceRequestOptions) => T }
