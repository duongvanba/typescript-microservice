export function get_name(service_or_topic: string, method?: string) {
    return `${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFIX + '|' : ''}${service_or_topic}${method ? `.${method}` : ''}`
}