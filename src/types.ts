export type RemoteServiceResponse = {
    type: 'response' | 'ping' | 'callback' | 'error'
    data?: any,
    message?: string,
    callback?: { index: number, args: any }
}

export type RemoteServiceRequestOptions = {
    route?: any,
    timeout?: number
    connection?: string
    wait_result?: boolean
}


export type RPCRequestOptions = RemoteServiceRequestOptions & {
    service: string,
    method: string,
    args: any 
}

export type RemoteRPCService<T> = T & { set: (config: RemoteServiceRequestOptions) => T, fetch: (config?: RemoteServiceRequestOptions) => T }


