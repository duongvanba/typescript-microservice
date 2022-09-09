import { Subscription } from "rxjs"



export type PublishOptions = {
    route?: string
}

export type ListenOptions = {
    fanout?: boolean,
    limit?: number,
    route?: string | { [key: string]: string | number } | (() => Promise<string | { [key: string]: string | number }>)
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
    listen(topic: string, cb: CallBackFunction, options: ListenOptions): Subscription
}



