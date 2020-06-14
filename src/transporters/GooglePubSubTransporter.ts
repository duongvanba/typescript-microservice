import { PubSub, Message } from '@google-cloud/pubsub'
import { Transporter, ListenOptions, CallBackFunction, PublishOptions } from './Transporter'
import { v4 } from 'uuid'
import { Message as TransportMessage } from './Transporter'
import { createHash } from 'crypto'
import { undefined_filter } from '../helpers/undefined_filter'


export class GooglePubSubTransporter implements Transporter {

    private client = new PubSub()

    async createTopic(name: string) {
        try {
            await this.client.createTopic(name)
        } catch (e) {
            const [code] = e.message.split(' ')
            if (code != 6) throw e
        }
    }

    async publish(topic: string, data: Buffer, options: PublishOptions = {}) {
        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Publish to topic [${topic}]`, JSON.stringify(options, null, 2))
        const { id, routing, reply_to } = options
        if (routing) {
            if ((routing as any).id != undefined || (routing as any).reply_to != undefined) throw 'INVAILD_ROUTING_KEY You can not use "id" or "reply_to" in routing condition'
        }
        const opts = undefined_filter({ id, reply_to, ... typeof routing == 'object' ? routing : {} })
        try {
            await this.client.topic(topic).publish(data, opts)
        } catch (e) {
            console.log(e.message)
        }
    }

    async listen(topic: string, cb: CallBackFunction, options: ListenOptions = {}) {
        const subscriberOptions = options.limit ? {
            flowControl: {
                maxMessages: options.limit
            },
        } : {}

        const routing = typeof options.routing == 'function' ? await options.routing() : options.routing
        const subscription_name = `${topic}${routing ? '-' + createHash('md5').update(routing).digest('hex') : ''}${options.fanout ? '.' + v4() : ''}`

        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Listen topic [${topic}]  with subscription [${subscription_name}] filter [${options.routing}]`, JSON.stringify(options, null, 2))

        try {
            // const sub_name = `${topic}${routing ? '-' + createHash('md5').update(routing).digest('hex') : ''}`
            await this.client.createSubscription(topic, subscription_name, {
                filter: routing,
                ackDeadlineSeconds: 600
            })
        } catch (e) {
            const [code] = e.message.split(' ')
            if (code != 6) throw e
        }

        const subscription = this.client.subscription(
            subscription_name,
            subscriberOptions
        );

        const messageHandler = async (message: Message) => {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] New message ${message.id} publish time ${message.publishTime}`)
            const msg: TransportMessage = {
                id: message.attributes.id,
                reply_to: message.attributes.reply_to,
                content: message.data,
                created_time: new Date(message.publishTime).getTime(),
                delivery_attempt: message.deliveryAttempt
            }
            const interval_extend_job = setInterval(() => message.modAck(600), 250000)
            try {
                await cb(msg)
                await message.ack()
            } catch (e) {

            }
            clearInterval(interval_extend_job)
        };

        subscription.on('message', messageHandler)
        return subscription_name
    }

    async deleteSubscription(name: string) {
        try {
            await this.client.subscription(name).delete()
        } catch (e) { }
    }

    async deleteTopic(name: string) {
        try {
            await this.client.topic(name).delete()
        } catch (e) { }
    }


}   