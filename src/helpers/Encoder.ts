function replacer(key, value) {
    const originalObject = this[key]

    if (originalObject instanceof Map) return {
        __dataType: 'Map',
        value: Array.from(originalObject.entries()), // or with spread: value: [...originalObject]
    }

    if (originalObject instanceof Set) return {
        __dataType: 'Set',
        value: Array.from(originalObject.values()), // or with spread: value: [...originalObject]
    }

    if (typeof originalObject == 'function') return {
        __dataType: 'Function'
    }

    return value
}


function receiver(key, value) {
    if (typeof value === 'object' && value !== null) {
        if (value.__dataType === 'Map') {
            return new Map(value.value);
        }

        if (value.__dataType === 'Set') {
            return new Set(value.value);
        }

        if (value.__dataType == 'Function') return () => { }
    }

    return value;
}

export const Encoder = {
    encode: <T = any>(data: T) => Buffer.from(JSON.stringify(data, replacer)),
    decode: <T = any>(data: Buffer | string) => JSON.parse(typeof data == 'string' ? data : data.toString('utf8'), receiver) as T
}