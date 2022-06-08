import { ListenOptions } from "./Transporter"

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

export type AllowFromRemoteOptions = ListenOptions & {
    connection?: string
}

export type SubcribeTopicOptions = ListenOptions & {
    topic: string
    connection?: string
}


export type RPCRequestOptions = RemoteServiceRequestOptions & {
    service: string,
    method: string,
    args: any
}

export type RemoteRPCService<T> = T & {
    wait_result(wait_result?: boolean): RemoteRPCService<T>,
    route(route: string | string[]): RemoteRPCService<T>,
    timeout(timeout: number): RemoteRPCService<T>
    connection(connection: string): RemoteRPCService<T>
} 