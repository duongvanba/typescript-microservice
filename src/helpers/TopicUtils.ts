
export class TopicUtils {
    static get_name(service_or_topic: string, method?: string) {
        const prefix = process.env.TS_MS_PREFIX
        return `${prefix ? prefix + '|' : ''}${service_or_topic}${method ? `.${method}` : ''}`
    }
}