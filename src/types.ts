
export type MicroserviceRequestEvent = { type: 'request', args: any[], request_id: string, reply_to?: string }
export type MicroserviceResponseEvent<T = any> = { type: 'response', data: T | void | undefined, request_id: string }
export type MicroserviceCallbackEvent = { type: 'callback', callback: { index: number, args: any[] }, request_id: string }
export type MicroserviceRemoteErrorEvent<T = any> = { type: 'error', message: string, data: T, request_id: string }
export type MicroservicePublishedEvent<T = any> = { type: 'event', data: T | undefined }

export type MicroserviceEvent = MicroserviceRequestEvent | MicroserviceResponseEvent | MicroserviceCallbackEvent | MicroserviceRemoteErrorEvent<any> | MicroservicePublishedEvent


export type RemoteRPCService<T> = T & {
    wait_result(wait_result?: boolean): RemoteRPCService<T>,
    route(route: string | string[]): RemoteRPCService<T>,
    timeout(timeout: number): RemoteRPCService<T>
    connection(connection: string): RemoteRPCService<T>
} 