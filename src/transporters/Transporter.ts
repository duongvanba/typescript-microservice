export type PublishOptions = {
    id?: string
    reply_to?: string,
    routing?: string
}
export type Message = { id?: string, reply_to?: string, content: Buffer, created_time: number }

export type CallBackFunction = (data: Message) => any

export type ListenOptions = {
    fanout?: boolean,
    limit?: number,
    routing?: string
}



export interface Transporter {
    createTopic(name: string): Promise<void>
    deleteTopic(name: string): Promise<void>
    deleteSubscription(name: string): Promise<void>
    publish(topic: string, data: Buffer, options?: PublishOptions): Promise<any>
    listen(topic: string, cb: CallBackFunction, options?: ListenOptions): Promise<string>
}



