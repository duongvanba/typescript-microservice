export class RPCInfomation {
    started_time: number
    is_old_request: () => boolean
    requested_time: number
    pingback: (data: any) => Promise<any>
    microservice_ready: () => boolean
}