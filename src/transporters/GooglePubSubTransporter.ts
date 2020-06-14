import { PubSub, Message } from '@google-cloud/pubsub'
import { Transporter, ListenOptions, CallBackFunction, PublishOptions } from './Transporter'
import { Encoder } from '../Encoder'
import { v4 } from 'uuid'
import { Message as TransportMessage } from './Transporter'



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
        await this.client.topic(topic).publish(data, options)
    }

    async listen(topic: string, cb: CallBackFunction, options: ListenOptions = {}) {
        const subscriberOptions = options.limit ? {
            flowControl: {
                maxMessages: options.limit
            },
        } : {}

        const subscription_name = options.fanout ? `${topic}.${v4()}` : topic

        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Listen topic [${topic}]  with subscription [${subscription_name}]`, JSON.stringify(options, null, 2))

        try {
            await this.client.createSubscription(topic, subscription_name, {
                filter: options.routing,
                ackDeadlineSeconds: 600,
                ...options.dead_topic ? {
                    deadLetterPolicy: {
                        deadLetterTopic: options.dead_topic
                    }
                } : {}
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