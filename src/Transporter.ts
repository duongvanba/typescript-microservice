export type PublishOptions = {
    id?: string
    reply_to?: string,
    route?: string
    timeout?: number
    connection?: string
}

export type ListenOptions = {
    fanout?: boolean,
    limit?: number,
    route?: any
    connection?: string
    concurrency?: number
}


export type Message = {
    id?: string,
    reply_to?: string,
    content: Buffer,
    created_time: number,
    delivery_attempt: number
    
}

export type CallBackFunction = (data: Message) => any

export interface Transporter { 
    publish(topic: string, data: Buffer, options?: PublishOptions): Promise<any>
    listen(topic: string, cb: CallBackFunction, options: ListenOptions): Promise<string>
}



