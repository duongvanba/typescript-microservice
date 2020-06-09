import { PubSub, Message } from '@google-cloud/pubsub'
import { Transporter, ListenOptions, CallBackFunction, PublishOptions } from './Transporter'
import { Encoder } from '../Encoder'
import { v4 } from 'uuid'




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

    async publish(topic: string, data: Buffer, options: PublishOptions) {
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
            await this.client.createSubscription(topic, subscription_name, { filter: options.routing, })
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
            const msg = {
                id: message.attributes.id,
                reply_to: message.attributes.reply_to,
                content: message.data,
                created_time: new Date(message.publishTime).getTime()
            }
            await cb(msg)
            message.ack();
        };

        subscription.on('message', messageHandler)
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